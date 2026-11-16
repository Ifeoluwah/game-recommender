import type { RecommendationIndex, ServiceGame } from "../domain/index-schema.js";
import { VOLATILITY_RANK } from "../domain/vocabulary.js";
import type { Market } from "../domain/vocabulary.js";
import type { ServiceConfig } from "./service-config.js";

/**
 * Request-time rules (spec 02 §6). Similarity proposes, rules dispose: every candidate goes through
 * eligibility (layer 2) and policy (layer 3), and no score can outweigh either. When too little
 * survives, the answer is a decline (layer 4) and the page hides the rail.
 */

export interface Context {
  brand: string;
  market: Market;
  /** 1–12. Decides seasonal availability. */
  month: number;
}

export type DeclineReason =
  | "BRAND_DISABLED"
  | "MARKET_NOT_SERVED_BY_BRAND"
  | "PLAYER_RESTRICTED"
  | "UNKNOWN_GAME"
  | "SEED_NOT_AVAILABLE"
  | "INSUFFICIENT_SOURCE_DATA"
  | "NO_CONFIDENT_MATCHES";

export const DECLINE_REASONS: readonly DeclineReason[] = [
  "BRAND_DISABLED",
  "MARKET_NOT_SERVED_BY_BRAND",
  "PLAYER_RESTRICTED",
  "UNKNOWN_GAME",
  "SEED_NOT_AVAILABLE",
  "INSUFFICIENT_SOURCE_DATA",
  "NO_CONFIDENT_MATCHES",
];

export interface RecommendRequest {
  gameId: string;
  brand: string;
  market: Market;
  limit?: number;
  playerRestricted?: boolean;
  /** Defaults to the current UTC month. */
  month?: number;
}

export interface RecommendedItem {
  gameId: string;
  title: string;
  score: number;
}

export interface RecommendResult {
  status: "ok" | "declined";
  reason?: DeclineReason;
  seed: ServiceGame | null;
  items: RecommendedItem[];
  /** Counts keyed `<layer>:<rule>`. Logged and used by the evaluation; never sent to clients. */
  diagnostics: Record<string, number>;
}

/** The parts of an index `recommend` needs; the evaluation swaps in other neighbour lists. */
export type RecommendIndex = Pick<RecommendationIndex, "games" | "neighbours" | "embedding">;

// --- Per-candidate rules (appendix A10) ---

/** A seed with unknown stakes is treated as the lowest-staking player (the bottom of the catalogue's ranges). */
export const UNKNOWN_SEED_MAX_STAKE = 2;
export const UNKNOWN_SEED_MIN_STAKE = 0.1;

/**
 * LAYER 2: HARD ELIGIBILITY. Can this game legally and operationally be shown to this player?
 * Every rule fails closed and none can be traded off against similarity.
 */
export function eligibilityProblems(g: ServiceGame, ctx: Context, config: ServiceConfig): string[] {
  const restricted = config.restrictedMechanicsByMarket[ctx.market] ?? [];
  return [
    g.status !== "active" && "not_live",
    g.isTestGame && "test_game",
    !g.brands.includes(ctx.brand) && "not_on_brand",
    !g.markets.includes(ctx.market) && "not_licensed_in_market",
    g.seasonMonths !== null && !g.seasonMonths.includes(ctx.month) && "out_of_season",
    g.mechanics.some((m) => restricted.includes(m)) && "feature_restricted_in_market",
  ].filter((x): x is string => typeof x === "string");
}

export const isEligible = (g: ServiceGame, ctx: Context, config: ServiceConfig) => eligibilityProblems(g, ctx, config).length === 0;

/**
 * LAYER 3: RECOMMENDATION POLICY. The game may be shown, but should we nudge THIS player to it?
 * "Because you played X" should not step someone up to a markedly riskier game than X:
 *  - at most `maxVolatilityStepUp` volatility levels above the seed;
 *  - a max bet no more than `maxStakeMultiplier` times the seed's;
 *  - a MINIMUM bet no more than `maxMinStakeMultiplier` times the seed's (a 10p player is not sent
 *    to a game that starts at £2).
 * Missing volatility fails closed, like eligibility: an unknown seed is treated as low, and a
 * candidate whose volatility is unknown is only allowed when the cap would admit anything.
 * (The evaluation found this gap: with "unknown means allow", records missing volatility let
 * low→high escalations through.)
 * This is a product/safer-gambling policy, configurable and owned with compliance, not a claim
 * that any one regulation requires these exact numbers.
 */
export function policyProblems(seed: ServiceGame, g: ServiceGame, config: ServiceConfig): string[] {
  const out: string[] = [];
  const cap = VOLATILITY_RANK[seed.volatility ?? "low"] + config.policy.maxVolatilityStepUp;
  if (g.volatility ? VOLATILITY_RANK[g.volatility] > cap : cap < VOLATILITY_RANK.extreme) {
    out.push(g.volatility ? "volatility_escalation" : "volatility_unknown");
  }
  // Stakes fail closed the same way. The feed carries them on every record with any detail, so
  // this rarely fires, but "unknown" must never mean "allowed": a candidate with unknown stakes is
  // blocked, and a seed with unknown stakes is treated as the most cautious player.
  const seedMax = seed.maxStake ?? UNKNOWN_SEED_MAX_STAKE, seedMin = seed.minStake ?? UNKNOWN_SEED_MIN_STAKE;
  if (g.maxStake == null || g.minStake == null) out.push("stake_unknown");
  else {
    if (g.maxStake > seedMax * config.policy.maxStakeMultiplier) out.push("stake_escalation");
    if (g.minStake > seedMin * config.policy.maxMinStakeMultiplier) out.push("min_bet_escalation");
  }
  return out;
}

// --- The request flow (spec 02 §6.2) ---

export const currentUtcMonth = (now: Date = new Date()): number => now.getUTCMonth() + 1;

/**
 * The name a player sees, ignoring case, spacing and punctuation. Two different games with one name
 * look like a duplicate on the page, so a rail never shows both (spec 02 §6.2).
 */
export const displayTitleKey = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]/g, "");

export function clampLimit(limit: number | undefined, config: ServiceConfig): number {
  const { defaultLimit, maxLimit } = config.recommendation;
  const n = limit === undefined || !Number.isFinite(limit) ? defaultLimit : Math.trunc(limit);
  return Math.min(maxLimit, Math.max(1, n));
}

export function scoreThreshold(index: Pick<RecommendIndex, "embedding">, config: ServiceConfig): number {
  const t = config.recommendation.minScoreByEmbedder[index.embedding.id];
  // loadIndex refuses such an index; reaching here without a threshold is a programming error.
  if (t === undefined) throw new Error(`no score threshold configured for embedder "${index.embedding.id}"`);
  return t;
}

export function recommend(index: RecommendIndex, config: ServiceConfig, req: RecommendRequest): RecommendResult {
  const diagnostics: Record<string, number> = {};
  const decline = (reason: DeclineReason, seed: ServiceGame | null = null): RecommendResult => ({ status: "declined", reason, seed, items: [], diagnostics });

  // 1. Brand, market, then the player's restriction: before any seed check, so a restricted
  //    player's answer never depends on which game they're looking at.
  const brand = config.brands[req.brand];
  if (!brand || !brand.enabled) return decline("BRAND_DISABLED");
  if (!brand.markets.includes(req.market)) return decline("MARKET_NOT_SERVED_BY_BRAND");
  if (req.playerRestricted) return decline("PLAYER_RESTRICTED");

  // 2. The seed. Status, brand and season are deliberately not checked: a withdrawn or
  //    out-of-season game's page is exactly where alternatives help. Candidates get all of layer 2.
  const seed = index.games[req.gameId];
  if (!seed) return decline("UNKNOWN_GAME");
  if (!seed.markets.includes(req.market) || seed.isTestGame) return decline("SEED_NOT_AVAILABLE", seed);
  if (seed.insufficient) return decline("INSUFFICIENT_SOURCE_DATA", seed);

  // 3. Walk the precomputed neighbours in score order.
  const ctx: Context = { brand: req.brand, market: req.market, month: req.month ?? currentUtcMonth() };
  const limit = clampLimit(req.limit, config);
  const threshold = scoreThreshold(index, config);
  const { maxPerProvider, maxPerSeries, minResults } = config.recommendation;
  const count = (key: string) => { diagnostics[key] = (diagnostics[key] ?? 0) + 1; };
  /** Records every problem of the first failing layer; true if there was one. */
  const fails = (layer: string, problems: string[]) => {
    for (const p of problems) count(`${layer}:${p}`);
    return problems.length > 0;
  };

  const items: RecommendedItem[] = [];
  const acceptedKeys = new Set([seed.dedupeKey]);
  const acceptedTitles = new Set([displayTitleKey(seed.title)]);
  const perProvider = new Map<string, number>();
  const perSeries = new Map<string, number>();

  for (const [id, score] of index.neighbours[seed.id] ?? []) {
    if (items.length >= limit) break;
    if (score < threshold) break; // neighbours are sorted, so nothing after this qualifies either
    const g = index.games[id];
    if (!g) { count("quality:not_in_index"); continue; } // a validated index can't do this; fail closed anyway

    if (fails("eligibility", eligibilityProblems(g, ctx, config))) continue;
    if (fails("policy", policyProblems(seed, g, config))) continue;
    // Same game (dedupe key), or a different game with the same displayed name. A duplicate is only
    // counted once: as a duplicate, not also as a title clash.
    const sameGame = acceptedKeys.has(g.dedupeKey);
    const sameName = !sameGame && acceptedTitles.has(displayTitleKey(g.title));
    if (fails("quality", [g.insufficient && "thin_record", sameGame && "duplicate_or_rtp_variant", sameName && "duplicate_title"].filter((x): x is string => typeof x === "string"))) continue;

    const provider = g.provider ?? "unknown";
    const diversity = [
      (perProvider.get(provider) ?? 0) >= maxPerProvider && "provider_cap",
      g.seriesId !== null && (perSeries.get(g.seriesId) ?? 0) >= maxPerSeries && "series_cap",
    ].filter((x): x is string => typeof x === "string");
    if (fails("diversity", diversity)) continue;

    items.push({ gameId: g.id, title: g.title, score });
    acceptedKeys.add(g.dedupeKey);
    acceptedTitles.add(displayTitleKey(g.title));
    perProvider.set(provider, (perProvider.get(provider) ?? 0) + 1);
    if (g.seriesId !== null) perSeries.set(g.seriesId, (perSeries.get(g.seriesId) ?? 0) + 1);
  }

  // 4. Decline over pad.
  if (items.length < Math.min(minResults, limit)) return decline("NO_CONFIDENT_MATCHES", seed);
  return { status: "ok", seed, items, diagnostics };
}
