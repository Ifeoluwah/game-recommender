import { KNOWN_BRANDS } from "../config.js";
import type { NormalisedGame, RawRecord } from "../domain/types.js";
import { AGGREGATORS, JACKPOT_NETWORKS, PROVIDERS, TAG_SYNONYMS, isMarket, isMechanic, isTheme, isVolatility } from "../domain/vocabulary.js";
import type { GameType, Market, Mechanic, Theme, Volatility } from "../domain/vocabulary.js";
import { sha256, stableStringify } from "../util/misc.js";

/**
 * Deterministic cleaning. Everything that can be fixed with rules is fixed here, before any
 * model sees the record: rules are cheap, testable and auditable; the LLM only fills real gaps.
 *
 * Eligibility fields fail CLOSED: a record without markets is available nowhere, and a record
 * without a status is treated as withdrawn. On a regulated product, a missing licence fact
 * must never be read as "allowed".
 */

const str = (v: unknown): string | null => (typeof v === "string" ? v.trim() || null : typeof v === "number" ? String(v) : null);

const list = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(/[;,|]/).map((x) => x.trim()).filter(Boolean);
  return [];
};

const providerKey = (s: string) => s.toLowerCase().replace(/\b(ltd|limited|plc)\b/g, "").replace(/[^a-z0-9]/g, "");
const PROVIDER_BY_KEY = new Map(PROVIDERS.map((p) => [providerKey(p), p as string]));

export function normaliseProvider(v: unknown): string | null {
  const s = str(v);
  if (!s || /^(unknown|n\/?a|tbc|-)$/i.test(s)) return null;
  return PROVIDER_BY_KEY.get(providerKey(s)) ?? s;
}

export function normaliseGameType(v: unknown): GameType | null {
  const s = str(v)?.toLowerCase();
  if (!s) return null;
  if (/slot/.test(s)) return "slot";
  if (/live/.test(s)) return "live";
  if (/table|blackjack|roulette|baccarat/.test(s)) return "table";
  if (/scratch|instant/.test(s)) return "instant_win";
  if (/bingo/.test(s)) return "bingo";
  return null;
}

export function normaliseVolatility(v: unknown): Volatility | null {
  const s = str(v)?.toLowerCase();
  if (!s) return null;
  if (isVolatility(s)) return s;
  const frac = s.match(/^(\d)\s*\/\s*5$/);
  if (frac) {
    const n = Number(frac[1]);
    return n <= 2 ? "low" : n === 3 ? "medium" : n === 4 ? "high" : "extreme";
  }
  if (/^(l|lo)$/.test(s)) return "low";
  if (/^(m|med|mid)$/.test(s)) return "medium";
  if (/^(very high|extreme|x|insane)$/.test(s)) return "extreme";
  if (/^h$/.test(s) || s.includes("high")) return "high";
  return null;
}

/** Bets arrive as 100, "£500", "500.00", "10p". Authoritative only: never inferred. */
export function normaliseStake(v: unknown): number | null {
  const s = typeof v === "number" ? String(v) : str(v);
  if (!s) return null;
  const pence = s.trim().match(/^(\d+(?:\.\d+)?)\s*p$/i);
  const n = pence ? Number(pence[1]) / 100 : Number(s.replace(/[£$€,\s]/g, ""));
  return Number.isFinite(n) && n > 0 && n <= 100_000 ? Math.round(n * 100) / 100 : null;
}

const aggKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const AGGREGATOR_BY_KEY = new Map(AGGREGATORS.map((a) => [aggKey(a), a as string]));
const asAggregator = (v: unknown) => { const s = str(v); return s ? AGGREGATOR_BY_KEY.get(aggKey(s)) ?? null : null; };

/**
 * Studio vs aggregator. Feeds confuse them: the aggregator's name lands in the studio field, or the
 * two are swapped. The studio is what identifies a game (dedupe key, provider diversity cap), so a
 * mislabelled duplicate would otherwise slip past duplicate detection.
 */
export function resolveStudio(studioField: unknown, aggregatorField: unknown): { studio: string | null; aggregator: string | null } {
  const studioAsAgg = asAggregator(studioField);
  if (studioAsAgg) {
    // The studio field holds an aggregator. If the aggregator field holds a studio, they are swapped.
    const other = normaliseProvider(aggregatorField);
    return { studio: other && !asAggregator(aggregatorField) ? other : null, aggregator: studioAsAgg };
  }
  return { studio: normaliseProvider(studioField), aggregator: asAggregator(aggregatorField) };
}

/**
 * Seasonal window, e.g. [11, 12, 1]. Absent means "all year". Present but unreadable (not a list, or no valid month)
 * fails closed: an empty window, so the game is never in season until the feed is fixed. A typo in
 * the feed must not turn a seasonal title into an all-year one.
 */
export function normaliseMonths(v: unknown): number[] | null {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v)) return [];
  const months = v.map(Number).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  return [...new Set(months)].sort((a, b) => a - b);
}

/** RTP arrives as 96.21, "96.21%", "0.9621" or "96,21". Out-of-range values are rejected, not guessed. */
export function normaliseRtp(v: unknown): number | null {
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") n = Number(v.replace("%", "").replace(",", ".").trim());
  else return null;
  if (!Number.isFinite(n)) return null;
  if (n > 0 && n < 1) n *= 100;
  n = Math.round(n * 100) / 100;
  return n >= 85 && n <= 99.9 ? n : null;
}

export function normaliseYear(v: unknown): number | null {
  const m = str(v)?.match(/(19|20)\d{2}/);
  const y = m ? Number(m[0]) : null;
  return y && y >= 1990 && y <= 2030 ? y : null;
}

export function cleanText(v: unknown): string {
  const s = str(v) ?? "";
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanTitle(v: unknown): string {
  return cleanText(v).replace(/[™®©]/g, "").replace(/\s+/g, " ").trim();
}

export interface ParsedTags {
  themes: Theme[];
  mechanics: Mechanic[];
  unknown: string[];
  /** Coarse facts suppliers put in tags ("Slots", "High Volatility"); used only when the proper field is missing. */
  gameTypeHint: GameType | null;
  volatilityHint: Volatility | null;
}

export function parseTags(v: unknown): ParsedTags {
  const themes = new Set<Theme>(), mechanics = new Set<Mechanic>(), unknown: string[] = [];
  let gameTypeHint: GameType | null = null, volatilityHint: Volatility | null = null;
  for (const rawTag of list(v)) {
    const t = rawTag.toLowerCase().trim();
    const vol = t.match(/^(low|med|medium|high|very high|extreme)[\s-]+volatility$/);
    if (vol) { volatilityHint = normaliseVolatility(vol[1]); continue; }
    const typeFromTag = /^(slots?|video slots?|table games?|live casino|instant win|scratchcards?|bingo)$/.test(t) ? normaliseGameType(t) : null;
    if (typeFromTag) { gameTypeHint = typeFromTag; continue; }
    const snake = t.replace(/[\s-]+/g, "_");
    const mapped = isTheme(snake) || isMechanic(snake) ? snake : TAG_SYNONYMS[t];
    if (mapped && isTheme(mapped)) themes.add(mapped);
    else if (mapped && isMechanic(mapped)) mechanics.add(mapped);
    else unknown.push(rawTag);
  }
  return { themes: [...themes], mechanics: [...mechanics], unknown, gameTypeHint, volatilityHint };
}

/** "5,000x", "x5000", 5000 -> 5000. Anything implausible becomes null rather than a guess. */
export function normaliseMaxWin(v: unknown): number | null {
  const s = typeof v === "number" ? String(v) : str(v);
  if (!s) return null;
  const n = Number(s.toLowerCase().replace(/x/g, "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n >= 10 && n <= 1_000_000 ? Math.round(n) : null;
}

const jackpotKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const JACKPOT_BY_KEY = new Map(JACKPOT_NETWORKS.map((j) => [jackpotKey(j), j as string]));

/** Specs arrive as a nested blob with varying keys, or as flat columns. */
export function parseSpecs(raw: RawRecord): { reelLayout: string | null; maxWin: number | null; jackpotNetwork: string | null } {
  const specs = raw.specs && typeof raw.specs === "object" ? (raw.specs as Record<string, unknown>) : {};
  const first = (...vals: unknown[]) => vals.find((x) => x !== undefined && x !== null && x !== "");
  const layout = str(first(specs.reels, specs.layout, specs.grid, raw.reel_layout));
  const jackpot = str(first(specs.jackpot, specs.jackpot_network, raw.jackpot_network));
  return {
    reelLayout: layout ? cleanText(layout).slice(0, 40) : null,
    maxWin: normaliseMaxWin(first(specs.max_win, specs.maxWin, raw.max_win_multiplier)),
    jackpotNetwork: jackpot ? (JACKPOT_BY_KEY.get(jackpotKey(jackpot)) ?? jackpot) : null,
  };
}

/**
 * Title used for duplicate detection. Strips a trailing RTP marker, because RTP variants of one game
 * must never be recommended against each other:
 *  - an explicit percentage, "Gold Rush (94.1%)" or "Gold Rush 94%", always;
 *  - a bare trailing number, "Gold Rush 94", only when it matches the record's own RTP, so a game
 *    genuinely called "Lucky 88" or "Route 96" keeps its number.
 */
export function dedupeTitle(title: string, rtp: number | null = null): string {
  let t = title.replace(/\s*\(?\s*\d{2}(?:[.,]\d{1,2})?\s*%\s*\)?\s*$/, "");
  const bare = t.match(/\s(\d{2})\s*$/);
  if (bare && rtp !== null && Math.floor(rtp) === Number(bare[1])) t = t.slice(0, bare.index);
  return t.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normaliseRecord(raw: RawRecord): NormalisedGame {
  const issues: string[] = [];
  const id = str(raw.game_id);
  if (!id) throw new Error(`record without game_id: ${JSON.stringify(raw).slice(0, 80)}`);
  const title = cleanTitle(raw.name);
  if (!title) issues.push("title_missing");

  const { studio: provider, aggregator } = resolveStudio(raw.studio, raw.aggregator);
  if (!provider) issues.push("provider_missing");
  if (provider && normaliseProvider(raw.studio) !== provider) issues.push("studio_aggregator_repaired");

  const tags = parseTags(raw.tags);
  if (tags.unknown.length) issues.push(`unknown_tags:${tags.unknown.length}`);

  const rawMarkets = list(raw.markets).map((m) => (m.toUpperCase() === "UK" ? "GB" : m.toUpperCase()));
  const markets = rawMarkets.filter(isMarket) as Market[];
  if (raw.markets === undefined || raw.markets === null) issues.push("markets_missing_fail_closed");

  const brandsRaw = list(raw.brands).map((b) => b.toLowerCase());
  const brands = brandsRaw.filter((b) => (KNOWN_BRANDS as readonly string[]).includes(b));
  if (brands.length < brandsRaw.length) issues.push("unknown_brand_dropped");

  // Only an explicit live status counts as live. SUSPENDED, CERTIFICATION_EXPIRED, DEMO_ONLY,
  // maintenance, unknown values and a missing status all fail closed.
  const statusRaw = str(raw.status)?.toLowerCase();
  const status: NormalisedGame["status"] = statusRaw && ["live", "active", "enabled"].includes(statusRaw) ? "active" : "withdrawn";
  if (!statusRaw) issues.push("status_missing_fail_closed");
  else if (status === "withdrawn") issues.push(`status_not_live:${statusRaw}`);

  // Internal test builds leak into feeds: flagged explicitly, or recognisable by name.
  const testFlag = raw.is_test_game === true || /^(y|yes|true|1)$/i.test(String(raw.is_test_game ?? ""));
  const isTestGame = testFlag || /^(test|qa|dev)[_\s-]/i.test(title);
  if (isTestGame) issues.push("test_game");
  const seasonMonths = normaliseMonths(raw.available_months);
  if (seasonMonths !== null && seasonMonths.length === 0) issues.push("season_unreadable");

  const series = str(raw.franchise);
  const specs = parseSpecs(raw);
  return {
    id,
    title,
    dedupeKey: `${dedupeTitle(title, normaliseRtp(raw.rtp))}|${provider ? providerKey(provider) : "?"}`,
    provider,
    aggregator,
    gameType: normaliseGameType(raw.category) ?? tags.gameTypeHint,
    themes: tags.themes,
    mechanics: tags.mechanics,
    volatility: normaliseVolatility(raw.volatility) ?? tags.volatilityHint,
    rtp: normaliseRtp(raw.rtp),
    maxStake: normaliseStake(raw.max_bet),
    minStake: normaliseStake(raw.min_bet),
    releaseYear: normaliseYear(raw.release),
    ...specs,
    description: cleanText(raw.description),
    seriesId: series ? series.toLowerCase().replace(/[^a-z0-9]+/g, "-") : null,
    brands: [...new Set(brands)].sort(),
    markets: [...new Set(markets)].sort() as Market[],
    status,
    isTestGame,
    seasonMonths,
    unknownTags: tags.unknown,
    issues,
    sourceHash: sha256(stableStringify(raw)),
  };
}
