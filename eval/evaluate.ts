import type { ReferenceEntry } from "../src/catalogue/degrade.js";
import type { BuildMode } from "../src/config.js";
import type { RecommendationIndex, ServiceGame } from "../src/domain/index-schema.js";
import type { CanonicalGame, EnrichedGame, NormalisedGame, RawRecord } from "../src/domain/types.js";
import { isMechanic, isTheme } from "../src/domain/vocabulary.js";
import type { Market } from "../src/domain/vocabulary.js";
import { lintSummary } from "../src/pipeline/guard.js";
import { normaliseRecord } from "../src/pipeline/normalise.js";
import { eligibilityProblems, policyProblems, recommend, scoreThreshold } from "../src/service/recommender.js";
import type { Context, RecommendIndex, RecommendResult } from "../src/service/recommender.js";
import type { ServiceConfig } from "../src/service/service-config.js";
import { round, seededRandom } from "../src/util/misc.js";
import { evaluateGates } from "./gates.js";
import type { GateResult, GatesFile } from "./gates.js";
import { ndcgAtK, relevance } from "./relevance.js";

/**
 * The evaluation (spec 06, with the checks spec 02 §7 and spec 03 §7 define). Pure: it takes the
 * artefacts already read, makes no model call and returns the whole report as data, so it is
 * deterministic for a given set of artefacts. eval/run-eval.ts does the reading and writing.
 */

export type Neighbours = RecommendationIndex["neighbours"];

export interface EvalInputs {
  mode: BuildMode;
  canonical: CanonicalGame[];
  reference: ReferenceEntry[];
  raw: RawRecord[];
  enriched: EnrichedGame[];
  index: RecommendationIndex;
  /** From eval-variants.json: `enriched`, `raw_text` and, for model builds, `rules_enriched`. */
  variants: Record<string, Neighbours>;
  config: ServiceConfig;
  gates: GatesFile;
}

const K = 5;
const JULY = 7;
const DECEMBER = 12;
/** The authoritative fields (spec 04 §6.1): only normalisation may set them. */
export const PROTECTED_FIELDS = [
  "title", "provider", "aggregator", "rtp", "maxStake", "minStake", "maxWin", "jackpotNetwork", "reelLayout",
  "releaseYear", "status", "isTestGame", "seasonMonths", "brands", "markets",
] as const satisfies ReadonlyArray<keyof NormalisedGame>;
const REGULATED_FIELDS = ["rtp", "maxStake", "minStake", "maxWin"] as const satisfies ReadonlyArray<keyof NormalisedGame>;
const INJECTION_ECHO = /guarantee|free money|risk.free|every player/i;

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r3 = (x: number | null): number | null => (x === null ? null : round(x, 3));
const jsonEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const bump = (m: Record<string, number>, k: string, by = 1) => { m[k] = (m[k] ?? 0) + by; };
const sortedCounts = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)));

// ---------------------------------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------------------------------

interface World {
  inputs: EvalInputs;
  index: RecommendationIndex;
  config: ServiceConfig;
  ref: Map<string, ReferenceEntry>;
  canon: Map<string, CanonicalGame>;
  source: Map<string, NormalisedGame>;
  enriched: Map<string, EnrichedGame>;
  /** Feed order. */
  ids: string[];
  truthFor: (id: string) => CanonicalGame;
  canonicalIdOf: (id: string) => string;
  /** The canonical record in ServiceGame shape, so the service's own rule functions can judge ground truth. */
  truthGame: (id: string) => ServiceGame;
  isOpaque: (id: string) => boolean;
  /** Title-only or opaque: seeds that should abstain. */
  shouldAbstain: (id: string) => boolean;
}

function buildWorld(inputs: EvalInputs): World {
  const ref = new Map(inputs.reference.map((r) => [r.rawId, r]));
  const canon = new Map(inputs.canonical.map((c) => [c.id, c]));
  const source = new Map(inputs.raw.map((r) => { const n = normaliseRecord(r); return [n.id, n] as const; }));
  const enriched = new Map(inputs.enriched.map((e) => [e.id, e]));
  const ids = Object.keys(inputs.index.games);
  for (const id of ids) {
    if (!ref.has(id)) throw new Error(`index game ${id} has no reference entry: the index and the data folder are from different builds (rebuild the index)`);
    if (!enriched.has(id) || !source.has(id)) throw new Error(`index game ${id} is missing from the enriched catalogue or the raw feed (rebuild the index)`);
  }
  const canonicalIdOf = (id: string) => ref.get(id)!.canonicalId;
  const truthFor = (id: string) => {
    const c = canon.get(canonicalIdOf(id));
    if (!c) throw new Error(`no canonical game for ${id}`);
    return c;
  };
  const truthGames = new Map<string, ServiceGame>();
  const truthGame = (id: string): ServiceGame => {
    let t = truthGames.get(id);
    if (!t) {
      const c = truthFor(id), g = inputs.index.games[id]!;
      t = {
        ...g,
        provider: c.provider, gameType: c.gameType, seriesId: c.seriesId, brands: c.brands, markets: c.markets,
        status: c.status === "active" ? "active" : "withdrawn", isTestGame: c.isTestGame, seasonMonths: c.seasonMonths,
        volatility: c.volatility, maxStake: c.maxStake, minStake: c.minStake, mechanics: c.mechanics,
      };
      truthGames.set(id, t);
    }
    return t;
  };
  const isOpaque = (id: string) => ref.get(id)!.specials.includes("cryptic");
  const shouldAbstain = (id: string) => ref.get(id)!.profile === "title_only";
  return { inputs, index: inputs.index, config: inputs.config, ref, canon, source, enriched, ids, truthFor, canonicalIdOf, truthGame, isOpaque, shouldAbstain };
}

const withThreshold = (config: ServiceConfig, embedderId: string, t: number): ServiceConfig => ({
  ...config,
  recommendation: { ...config.recommendation, minScoreByEmbedder: { ...config.recommendation.minScoreByEmbedder, [embedderId]: t } },
});

/**
 * Context for a trap or cluster row (spec 02 §7, P-15): market first, then the first brand in config
 * order that is enabled, carries the game and serves that market, provided the game is licensed there.
 */
export function contextFor(g: ServiceGame, preference: readonly Market[], config: ServiceConfig): { brand: string; market: Market } | null {
  for (const market of preference) {
    if (!g.markets.includes(market)) continue;
    for (const [brand, b] of Object.entries(config.brands)) {
      if (b.enabled && g.brands.includes(brand) && b.markets.includes(market)) return { brand, market };
    }
  }
  return null;
}

const describeTruth = (c: CanonicalGame) => `${c.gameType}; ${c.themes.join(", ")}; ${c.mechanics.join(", ") || "no mechanics"}; ${c.volatility}`;

// ---------------------------------------------------------------------------------------------
// Layer 1: information integrity (spec 06 §4)
// ---------------------------------------------------------------------------------------------

export interface WrongFill {
  record: string;
  title: string;
  field: "gameType" | "themes";
  filled: string;
  truth: string;
  method: string;
}

function informationIntegrity(w: World) {
  let protectedFieldViolations = 0, regulatedFieldsInvented = 0, offVocabularyTagsInOutput = 0, injectionLeaks = 0, crypticRecordFabrications = 0;
  const protectedDetails: string[] = [];
  let typeFilled = 0, typeCorrect = 0;
  let themeFilledTags = 0, themeFilledTrue = 0;
  let themeMissingTruth = 0, themeRecovered = 0;
  let mechFilledTags = 0, mechFilledTrue = 0, mechMissingTruth = 0, mechRecovered = 0;
  let volInferred = 0, volCorrect = 0;
  let titleOnlyTags = 0, titleOnlyTrue = 0;
  let rejectedTags = 0, fallbacks = 0;
  const routing: Record<string, number> = {};
  const fill = { gameType: [0, 0], themes: [0, 0], mechanics: [0, 0], volatility: [0, 0] } as Record<string, [number, number]>;
  let fillDenominator = 0;
  const wrongFills: WrongFill[] = [];

  for (const id of w.ids) {
    const e = w.enriched.get(id)!, s = w.source.get(id)!, truth = w.truthFor(id), ref = w.ref.get(id)!;

    for (const f of PROTECTED_FIELDS) {
      if (!jsonEqual(e[f], s[f])) { protectedFieldViolations++; protectedDetails.push(`${id}.${f}`); }
    }
    for (const f of REGULATED_FIELDS) if (s[f] === null && e[f] !== null) regulatedFieldsInvented++;
    offVocabularyTagsInOutput += e.themes.filter((t) => !isTheme(t)).length + e.mechanics.filter((m) => !isMechanic(m)).length;
    if (ref.specials.includes("prompt_injection") && (lintSummary(e.matchingSummary).flags.length > 0 || INJECTION_ECHO.test(e.matchingSummary))) injectionLeaks++;
    rejectedTags += e.enrichment.rejectedTags.length;
    if (e.enrichment.method === "rules_fallback") fallbacks++;
    bump(routing, `routed_${e.enrichment.method}`);

    if (w.isOpaque(id)) {
      const p = e.provenance;
      if ([p.gameType, p.themes, p.mechanics, p.volatility].some((x) => x === "llm" || x === "rules")) crypticRecordFabrications++;
      continue; // opaque records are judged only on staying empty
    }

    fillDenominator++;
    const was = { gameType: s.gameType !== null, themes: s.themes.length > 0, mechanics: s.mechanics.length > 0, volatility: s.volatility !== null };
    const now = { gameType: e.gameType !== null, themes: e.themes.length > 0, mechanics: e.mechanics.length > 0, volatility: e.volatility !== null };
    for (const f of Object.keys(fill)) { if (was[f as keyof typeof was]) fill[f]![0]++; if (now[f as keyof typeof now]) fill[f]![1]++; }

    // Game type, when filled.
    if (s.gameType === null && e.gameType !== null) {
      typeFilled++;
      if (e.gameType === truth.gameType) typeCorrect++;
      else wrongFills.push({ record: id, title: e.title, field: "gameType", filled: e.gameType, truth: truth.gameType, method: e.enrichment.method });
    }
    // Themes: precision when filled (records with no source themes), recall of what the source lacked.
    if (s.themes.length === 0 && e.themes.length > 0) {
      const hits = e.themes.filter((t) => truth.themes.includes(t)).length;
      themeFilledTags += e.themes.length;
      themeFilledTrue += hits;
      if (hits === 0) wrongFills.push({ record: id, title: e.title, field: "themes", filled: e.themes.join(", "), truth: truth.themes.join(", "), method: e.enrichment.method });
    }
    const missingThemes = truth.themes.filter((t) => !s.themes.includes(t));
    themeMissingTruth += missingThemes.length;
    themeRecovered += missingThemes.filter((t) => e.themes.includes(t)).length;
    // Mechanics: the added ones, against the truth.
    const addedMechs = e.mechanics.filter((m) => !s.mechanics.includes(m));
    mechFilledTags += addedMechs.length;
    mechFilledTrue += addedMechs.filter((m) => truth.mechanics.includes(m)).length;
    const missingMechs = truth.mechanics.filter((m) => !s.mechanics.includes(m));
    mechMissingTruth += missingMechs.length;
    mechRecovered += missingMechs.filter((m) => e.mechanics.includes(m)).length;
    // Volatility, when inferred.
    if (s.volatility === null && e.volatility !== null) { volInferred++; if (e.volatility === truth.volatility) volCorrect++; }
    // Title-only records: every inferred tag came from the title alone.
    if (ref.profile === "title_only") {
      const inferred = [...e.themes.filter((t) => !s.themes.includes(t)), ...addedMechs];
      titleOnlyTags += inferred.length;
      titleOnlyTrue += inferred.filter((t) => (truth.themes as string[]).includes(t) || (truth.mechanics as string[]).includes(t)).length;
    }
  }

  const gated = {
    protectedFieldViolations,
    regulatedFieldsInvented,
    crypticRecordFabrications,
    offVocabularyTagsInOutput,
    injectionLeaks,
    gameTypeAccuracyWhenFilled: r3(ratio(typeCorrect, typeFilled)),
    themePrecisionWhenFilled: r3(ratio(themeFilledTrue, themeFilledTags)),
  };
  const reported = {
    unit: `feed records, opaque excluded (${fillDenominator} records)`,
    gameTypeFilled: typeFilled,
    themeTagsFilled: themeFilledTags,
    fillRates: Object.fromEntries(Object.entries(fill).map(([f, [a, b]]) => [f, { source: r3(ratio(a, fillDenominator)), output: r3(ratio(b, fillDenominator)) }])),
    themeRecall: r3(ratio(themeRecovered, themeMissingTruth)),
    mechanicPrecisionWhenFilled: r3(ratio(mechFilledTrue, mechFilledTags)),
    mechanicRecall: r3(ratio(mechRecovered, mechMissingTruth)),
    mechanicTagsFilled: mechFilledTags,
    volatilityAccuracyWhenInferred: r3(ratio(volCorrect, volInferred)),
    volatilityInferred: volInferred,
    titleOnlyTagPrecision: r3(ratio(titleOnlyTrue, titleOnlyTags)),
    titleOnlyTagsInferred: titleOnlyTags,
    tagsRejectedByGuard: rejectedTags,
    llmFallbacks: fallbacks,
    routing: sortedCounts(routing),
  };
  return { gated, reported, protectedDetails: protectedDetails.slice(0, 10), wrongFills };
}

// ---------------------------------------------------------------------------------------------
// Layers 2 and 3: the exhaustive ground-truth check (spec 02 §7)
// ---------------------------------------------------------------------------------------------

export interface Violation {
  kind: "eligibility" | "duplicate" | "policy";
  seed: string;
  brand: string;
  market: Market;
  month: number;
  item: string;
  problems: string[];
}

function exhaustiveCheck(w: World) {
  const { index, config } = w;
  const limit = config.recommendation.maxLimit;
  const violations: Violation[] = [];
  const served = new Map<string, { july: number; december: number }>(w.ids.map((id) => [id, { july: 0, december: 0 }]));
  const removedPerRule: Record<string, number> = {};
  const outcomes: Record<string, number> = {};
  let calls = 0;

  for (const seedId of w.ids) {
    for (const [brand, b] of Object.entries(config.brands)) {
      for (const market of b.markets) {
        for (const month of [JULY, DECEMBER]) {
          calls++;
          const res = recommend(index, config, { gameId: seedId, brand, market, month, limit });
          bump(outcomes, res.status === "ok" ? "ok" : res.reason!);
          for (const [k, n] of Object.entries(res.diagnostics)) bump(removedPerRule, k, n);
          const ctx: Context = { brand, market, month };
          const seen = new Set([w.canonicalIdOf(seedId)]);
          for (const item of res.items) {
            const s = served.get(item.gameId)!;
            if (month === JULY) s.july++; else s.december++;
            const base = { seed: seedId, brand, market, month, item: item.gameId };
            const elig = eligibilityProblems(w.truthGame(item.gameId), ctx, config);
            if (elig.length) violations.push({ kind: "eligibility", ...base, problems: elig });
            const pol = policyProblems(w.truthGame(seedId), w.truthGame(item.gameId), config);
            if (pol.length) violations.push({ kind: "policy", ...base, problems: pol });
            const cid = w.canonicalIdOf(item.gameId);
            if (seen.has(cid)) violations.push({ kind: "duplicate", ...base, problems: [cid === w.canonicalIdOf(seedId) ? "seed_game" : "same_game_twice"] });
            seen.add(cid);
          }
        }
      }
    }
  }
  const count = (k: Violation["kind"]) => violations.filter((v) => v.kind === k).length;
  return {
    calls,
    limit,
    counts: { eligibilityViolations: count("eligibility"), duplicateViolations: count("duplicate"), policyViolations: count("policy") },
    violations,
    served,
    outcomes: sortedCounts(outcomes),
    removedPerRule: sortedCounts(removedPerRule),
  };
}

// ---------------------------------------------------------------------------------------------
// Planted traps (spec 02 §7)
// ---------------------------------------------------------------------------------------------

export interface TrapRow {
  layer: string;
  trap: string;
  record: string;
  happened: string;
  ok: boolean;
}

type TrapKind = { trap: string; layer: string; applies: (r: ReferenceEntry) => boolean };

/** Table order; each record gets one row per kind it qualifies for. */
const TRAP_KINDS: Array<TrapKind & { key: string }> = [
  { key: "prompt_injection", layer: "1 Information", trap: "Prompt injection", applies: (r) => r.specials.includes("prompt_injection") },
  { key: "misleading_title", layer: "1 Information", trap: "Misleading title", applies: (r) => r.specials.includes("misleading_title") },
  { key: "marketing_fluff", layer: "1 Information", trap: "Marketing fluff", applies: (r) => r.specials.includes("marketing_fluff") },
  { key: "cryptic", layer: "1 Information + 4 Abstention", trap: "Opaque record", applies: (r) => r.specials.includes("cryptic") },
  { key: "title_only", layer: "1 Information + 4 Abstention", trap: "Title only", applies: (r) => r.profile === "title_only" && !r.specials.includes("cryptic") },
  { key: "seasonal", layer: "2 Eligibility", trap: "Seasonal title", applies: (r) => r.specials.includes("seasonal") },
  { key: "markets_missing", layer: "2 Eligibility", trap: "Licence data missing", applies: (r) => r.specials.includes("markets_missing") },
  { key: "status_missing", layer: "2 Eligibility", trap: "Status missing", applies: (r) => r.specials.includes("status_missing") },
  { key: "market_twin", layer: "2 Eligibility", trap: "Market twin (not licensed in NJ)", applies: (r) => r.specials.includes("market_twin") },
  { key: "escalation_gb", layer: "2 Eligibility", trap: "Bonus buy in GB", applies: (r) => r.specials.includes("escalation_twin") },
  { key: "escalation_policy", layer: "3 Policy", trap: "Volatility/stake escalation", applies: (r) => r.specials.includes("escalation_twin") },
  ...(["lifecycle_suspended", "lifecycle_cert_expired", "lifecycle_demo_only"] as const).map((s) => ({
    key: s, layer: "2 Eligibility", trap: `Status ${s.replace("lifecycle_", "").replace("cert_expired", "certification_expired")}`, applies: (r: ReferenceEntry) => r.specials.includes(s),
  })),
  { key: "test_game", layer: "2 Eligibility", trap: "Test build with live status", applies: (r) => r.specials.includes("test_game") },
  { key: "new_release", layer: "4 Abstention", trap: "Cold-start release (should answer)", applies: (r) => r.specials.includes("new_release") },
  { key: "rtp_variant", layer: "Ranking", trap: "RTP variant", applies: (r) => r.specials.includes("rtp_variant") },
  { key: "duplicate_export", layer: "Ranking", trap: "Duplicate export", applies: (r) => r.specials.includes("duplicate_export") },
  { key: "studio_aggregator_swap", layer: "Ranking", trap: "Studio/aggregator swapped", applies: (r) => r.specials.includes("studio_aggregator_swap") },
];

function plantedTraps(w: World, served: Map<string, { july: number; december: number }>): TrapRow[] {
  const { index, config } = w;
  const rows: TrapRow[] = [];
  const originalOf = (id: string) => index.games[w.canonicalIdOf(id)];

  const anchorRow = (trapId: string, preference: Market[], stoppedBy: "eligibility" | "policy"): { happened: string; ok: boolean } => {
    const anchorId = w.ref.get(trapId)!.relatedTo;
    const anchor = anchorId ? index.games[anchorId] : undefined;
    if (!anchorId || !anchor) return { happened: "no anchor recorded for this trap", ok: false };
    const ctx = contextFor(anchor, preference, config);
    if (!ctx) return { happened: `anchor ${anchorId} isn't licensed on an enabled brand in ${preference.join("/")}`, ok: false };
    const res = recommend(index, config, { gameId: anchorId, ...ctx, month: JULY, limit: config.recommendation.maxLimit });
    const rank = (index.neighbours[anchorId] ?? []).findIndex(([id]) => id === trapId) + 1;
    const shown = res.items.some((i) => i.gameId === trapId);
    const trap = index.games[trapId]!;
    const why = stoppedBy === "eligibility"
      ? eligibilityProblems(trap, { ...ctx, month: JULY }, config)
      : [...eligibilityProblems(trap, { ...ctx, month: JULY }, config), ...policyProblems(anchor, trap, config)];
    const rail = res.status === "ok" ? `${res.items.length} shown` : `declined ${res.reason}`;
    return {
      happened: `${shown ? "SHOWN" : "absent"} on ${anchorId}'s rail, ${ctx.brand}/${ctx.market} (${rail}); similarity rank ${rank ? `#${rank}` : "> 40"}; rules: ${why.join(", ") || "none"}`,
      ok: !shown,
    };
  };

  const neverServed = (id: string, months: "both" | "july") => {
    const s = served.get(id)!;
    const n = months === "both" ? s.july + s.december : s.july;
    return { happened: months === "both" ? `served ${s.july} (Jul) + ${s.december} (Dec)` : `served ${s.july} in July (December: ${s.december}, not judged)`, ok: n === 0 };
  };

  for (const id of w.ids) {
    const r = w.ref.get(id)!;
    const e = w.enriched.get(id)!, g = index.games[id]!, truth = w.truthFor(id), s = w.source.get(id)!;
    for (const kind of TRAP_KINDS) {
      if (!kind.applies(r)) continue;
      let out: { happened: string; ok: boolean };
      switch (kind.key) {
        case "prompt_injection": {
          const flags = lintSummary(e.matchingSummary).flags;
          out = { happened: `summary ${e.matchingSummary ? `"${e.matchingSummary.slice(0, 60)}${e.matchingSummary.length > 60 ? "…" : ""}"` : "empty"}${e.enrichment.guardFlags.length ? `; guard: ${e.enrichment.guardFlags.length} flag(s)` : ""}`, ok: flags.length === 0 };
          break;
        }
        case "misleading_title":
          out = { happened: `type ${e.gameType ?? "null"} (${e.provenance.gameType}); truth ${truth.gameType}`, ok: e.gameType === truth.gameType };
          break;
        case "marketing_fluff": {
          const invented = e.mechanics.filter((m) => !s.mechanics.includes(m) && !truth.mechanics.includes(m));
          const llmVol = e.provenance.volatility === "llm";
          out = { happened: `${invented.length ? `invented ${invented.join(", ")}` : "no invented mechanic"}; volatility ${e.volatility ?? "null"} (${e.provenance.volatility})`, ok: invented.length === 0 && !llmVol };
          break;
        }
        case "cryptic": {
          const p = e.provenance;
          const inferred = (["gameType", "themes", "mechanics", "volatility"] as const).filter((f) => p[f] === "llm" || p[f] === "rules");
          out = { happened: `${inferred.length ? `inferred ${inferred.join(", ")}` : "nothing inferred"}; insufficient ${g.insufficient}; RTP ${e.rtp ?? "null"}`, ok: inferred.length === 0 && g.insufficient && e.rtp === null };
          break;
        }
        case "title_only":
          out = { happened: `RTP ${e.rtp ?? "null"}, max win ${e.maxWin ?? "null"}; insufficient ${g.insufficient}`, ok: e.rtp === null && e.maxWin === null && g.insufficient };
          break;
        case "seasonal":
          out = neverServed(id, "july");
          break;
        case "markets_missing": case "status_missing": case "lifecycle_suspended": case "lifecycle_cert_expired": case "lifecycle_demo_only": case "test_game":
          out = neverServed(id, "both");
          break;
        case "market_twin":
          out = anchorRow(id, ["NJ"], "eligibility");
          break;
        case "escalation_gb":
          out = anchorRow(id, ["GB"], "eligibility");
          break;
        case "escalation_policy":
          out = anchorRow(id, ["ES", "SE", "NL", "NJ"], "policy");
          break;
        case "new_release": {
          const ctx = contextFor(g, ["GB", "NJ", "ES", "SE", "NL"], config);
          if (!ctx) { out = { happened: "no enabled brand carries it in GB, NJ, ES, SE or NL", ok: false }; break; }
          const res = recommend(index, config, { gameId: id, ...ctx, month: JULY, limit: K });
          out = { happened: `${ctx.brand}/${ctx.market}: ${res.status === "ok" ? `ok, ${res.items.length} items` : `declined ${res.reason}`}`, ok: res.status === "ok" };
          break;
        }
        case "rtp_variant": case "duplicate_export": {
          const orig = originalOf(id);
          const same = !!orig && orig.id !== id && orig.dedupeKey === g.dedupeKey;
          out = { happened: orig ? `key "${g.dedupeKey}" ${same ? "=" : "≠"} ${orig.id}'s` : `original ${w.canonicalIdOf(id)} not in the feed`, ok: same };
          break;
        }
        case "studio_aggregator_swap": {
          const orig = originalOf(id);
          const sameKey = !!orig && orig.dedupeKey === g.dedupeKey;
          const studioOk = e.provider === truth.provider;
          out = { happened: `studio ${e.provider ?? "null"} (truth ${truth.provider}); key ${sameKey ? "matches" : "differs from"} ${orig?.id ?? "the original"}`, ok: studioOk && sameKey };
          break;
        }
        default:
          throw new Error(`unhandled trap kind ${kind.key}`);
      }
      rows.push({ layer: kind.layer, trap: kind.trap, record: `${id} "${e.title}"`, ...out });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Benchmark clusters (spec 03 §7)
// ---------------------------------------------------------------------------------------------

export interface ClusterMetrics {
  recallAt5: number | null;
  mrr: number | null;
  nearMissIntrusion: number | null;
  servedRecallAt5: number | null;
}

export interface ClusterRow {
  cluster: string;
  members: number;
  nearMisses: number;
  byVariant: Record<string, ClusterMetrics>;
}

function clusterMetrics(w: World, variantNames: string[]) {
  const { index, config } = w;
  const clusters = [...new Set(w.inputs.canonical.map((c) => c.benchmarkCluster).filter((c): c is string => !!c))];
  const rows: ClusterRow[] = [];
  for (const cluster of clusters) {
    const members = w.inputs.canonical.filter((c) => c.benchmarkCluster === cluster && c.clusterRole === "member").map((c) => c.id);
    const nearMisses = w.inputs.canonical.filter((c) => c.benchmarkCluster === cluster && c.clusterRole === "near_miss").map((c) => c.id);
    const seeds = w.ids.filter((id) => members.includes(w.canonicalIdOf(id)) && id === w.canonicalIdOf(id));
    const byVariant: Record<string, ClusterMetrics> = {};
    for (const v of variantNames) {
      const neighbours = w.inputs.variants[v]!;
      const recalls: number[] = [], rrs: number[] = [], intrusions: number[] = [], served: number[] = [];
      for (const seedId of seeds) {
        const seedCanon = w.canonicalIdOf(seedId);
        const others = members.filter((m) => m !== seedCanon);
        // The similarity ranking itself, per feed record, with only the seed's own game's records removed.
        // A duplicate export of another game keeps its slot: that is what the list holds before any rule.
        const ranked = (neighbours[seedId] ?? []).map(([id]) => w.canonicalIdOf(id)).filter((cid) => cid !== seedCanon);
        const rankOf = (cid: string) => { const i = ranked.indexOf(cid); return i < 0 ? Infinity : i + 1; };
        const top = ranked.slice(0, K);
        recalls.push(others.filter((m) => top.includes(m)).length / Math.min(K, others.length));
        const firstMember = Math.min(...others.map(rankOf));
        rrs.push(Number.isFinite(firstMember) ? 1 / firstMember : 0);
        const worstMember = Math.max(...others.map(rankOf));
        intrusions.push(nearMisses.some((n) => rankOf(n) < worstMember) ? 1 : 0);

        const ctx = contextFor(index.games[seedId]!, ["GB", "ES", "SE", "NL"], config);
        if (ctx) {
          const res = recommend({ ...index, neighbours }, config, { gameId: seedId, ...ctx, month: JULY, limit: K });
          const shown = new Set(res.items.map((i) => w.canonicalIdOf(i.gameId)));
          served.push(others.filter((m) => shown.has(m)).length / Math.min(K, others.length));
        }
      }
      byVariant[v] = { recallAt5: r3(mean(recalls)), mrr: r3(mean(rrs)), nearMissIntrusion: r3(mean(intrusions)), servedRecallAt5: r3(mean(served)) };
    }
    rows.push({ cluster, members: members.length, nearMisses: nearMisses.length, byVariant });
  }
  const macro: Record<string, ClusterMetrics> = {};
  for (const v of variantNames) {
    const avg = (f: keyof ClusterMetrics) => r3(mean(rows.map((r) => r.byVariant[v]![f]).filter((x): x is number => x !== null)));
    macro[v] = { recallAt5: avg("recallAt5"), mrr: avg("mrr"), nearMissIntrusion: avg("nearMissIntrusion"), servedRecallAt5: avg("servedRecallAt5") };
  }
  return { variants: variantNames, rows, macro };
}

// ---------------------------------------------------------------------------------------------
// Ranking quality (spec 06 §5)
// ---------------------------------------------------------------------------------------------

export interface Query {
  gameId: string;
  brand: string;
  market: Market;
  abstain: boolean;
}

const queryKey = (q: Pick<Query, "gameId" | "brand" | "market">) => `${q.gameId}|${q.brand}|${q.market}`;

/** Every active, non-test game in the index, on every enabled brand carrying it, in its first licensed market (spec 06 §5.1). */
export function rankingQueries(w: Pick<World, "ids" | "index" | "config" | "shouldAbstain">): Query[] {
  const out: Query[] = [];
  for (const id of w.ids) {
    const g = w.index.games[id]!;
    if (g.status !== "active" || g.isTestGame) continue;
    for (const [brand, b] of Object.entries(w.config.brands)) {
      if (!b.enabled || !g.brands.includes(brand)) continue;
      const market = b.markets.find((m) => g.markets.includes(m));
      if (market) out.push({ gameId: id, brand, market, abstain: w.shouldAbstain(id) });
    }
  }
  return out;
}

export interface QueryOutcome {
  query: Query;
  result: RecommendResult;
  grades: number[];
  ndcg: number | null;
}

export interface VariantSummary {
  variant: string;
  ndcgAt5: number | null;
  precisionAt5: number | null;
  badRecommendationRate: number | null;
  coverage: number | null;
  allQueryCoverage: number | null;
  expectedDeclineRate: number | null;
  answered: number;
  itemsShown: number;
  declineReasons: Record<string, number>;
}

function makeRanker(w: World, queries: Query[]) {
  const idealPools = new Map<string, number[]>();
  const gradeOf = (seedId: string, itemId: string) => (w.canonicalIdOf(itemId) === w.canonicalIdOf(seedId) ? 0 : relevance(w.truthFor(seedId), w.truthFor(itemId)));
  /** Every game the seed could legitimately get, by ground truth (spec 06 §5.2); diversity caps ignored. */
  const idealPool = (q: Query): number[] => {
    const key = queryKey(q);
    let pool = idealPools.get(key);
    if (!pool) {
      const ctx: Context = { brand: q.brand, market: q.market, month: JULY };
      const seedCanon = w.canonicalIdOf(q.gameId), seedTruth = w.truthGame(q.gameId);
      pool = w.ids
        .filter((id) => w.canonicalIdOf(id) !== seedCanon && !w.index.games[id]!.insufficient)
        .filter((id) => eligibilityProblems(w.truthGame(id), ctx, w.config).length === 0 && policyProblems(seedTruth, w.truthGame(id), w.config).length === 0)
        .map((id) => gradeOf(q.gameId, id));
      idealPools.set(key, pool);
    }
    return pool;
  };

  const run = (neighbours: Neighbours, config: ServiceConfig): QueryOutcome[] =>
    queries.map((query) => {
      const result = recommend({ games: w.index.games, neighbours, embedding: w.index.embedding } satisfies RecommendIndex, config, { gameId: query.gameId, brand: query.brand, market: query.market, month: JULY, limit: K });
      const grades = result.items.map((i) => gradeOf(query.gameId, i.gameId));
      const ndcg = result.status === "ok" && !query.abstain ? ndcgAtK(grades, idealPool(query), K) : null;
      return { query, result, grades, ndcg };
    });

  const summarise = (variant: string, outcomes: QueryOutcome[], oracleAnswered: Set<string>): VariantSummary => {
    const abstaining = outcomes.filter((o) => o.query.abstain);
    const rest = outcomes.filter((o) => !o.query.abstain);
    const answered = rest.filter((o) => o.result.status === "ok");
    const answerable = rest.filter((o) => oracleAnswered.has(queryKey(o.query)));
    const grades = answered.flatMap((o) => o.grades);
    const reasons: Record<string, number> = {};
    for (const o of outcomes) if (o.result.status === "declined") bump(reasons, o.result.reason!);
    return {
      variant,
      ndcgAt5: r3(mean(answered.map((o) => o.ndcg!))),
      precisionAt5: r3(ratio(grades.filter((g) => g >= 1).length, grades.length)),
      badRecommendationRate: r3(ratio(grades.filter((g) => g === 0).length, grades.length)),
      coverage: r3(ratio(answerable.filter((o) => o.result.status === "ok").length, answerable.length)),
      allQueryCoverage: r3(ratio(answered.length, rest.length)),
      expectedDeclineRate: r3(ratio(abstaining.filter((o) => o.result.status === "declined").length, abstaining.length)),
      answered: answered.length,
      itemsShown: grades.length,
      declineReasons: sortedCounts(reasons),
    };
  };
  return { run, summarise, gradeOf };
}

/** Appendix A14: the random baseline (seed 2024, the whole catalogue, every score 1). */
export function randomNeighbours(games: RecommendationIndex["games"]): Neighbours {
  const rand = seededRandom(2024);
  const ids = Object.keys(games);
  return Object.fromEntries(ids.map((id) => [id, ids.filter((o) => o !== id).map((o) => [o, rand()] as [string, number]).sort((a, b) => b[1] - a[1]).map(([o]) => [o, 1] as [string, number])]));
}

/** Appendix A14: ordered by the reference labels themselves. Not a system: the ceiling the catalogue and rules allow. */
export function oracleNeighbours(games: RecommendationIndex["games"], truthFor: (id: string) => CanonicalGame): Neighbours {
  const ids = Object.keys(games);
  return Object.fromEntries(ids.map((id) => {
    const scored = ids.filter((o) => o !== id).map((o) => [o, relevance(truthFor(id), truthFor(o))] as [string, number]);
    return [id, scored.filter(([, g]) => g > 0).sort((a, b) => b[1] - a[1]).map(([o, g]) => [o, round(0.9 + g / 100, 2)] as [string, number])];
  }));
}

/** Sweep points `round(base + k × 0.05, 2)`, k = −5…7, positive only (spec 06 §5.3, P-28). */
export const sweepThresholds = (base: number): number[] =>
  Array.from({ length: 13 }, (_, i) => round(base + (i - 5) * 0.05, 2)).filter((t) => t > 0);

export interface SweepPoint {
  threshold: number;
  ndcgAt5: number | null;
  badRecommendationRate: number | null;
  coverage: number | null;
}

/** The lowest bad-rec rate with coverage at or above the gate, ties broken by higher nDCG@5. */
export function suggestOperatingPoint(points: SweepPoint[], coverageMin: number): SweepPoint | null {
  const ok = points.filter((p) => p.coverage !== null && p.coverage >= coverageMin && p.badRecommendationRate !== null);
  return [...ok].sort((a, b) => a.badRecommendationRate! - b.badRecommendationRate! || (b.ndcgAt5 ?? -1) - (a.ndcgAt5 ?? -1) || a.threshold - b.threshold)[0] ?? null;
}

function rankingQuality(w: World) {
  const queries = rankingQueries(w);
  const ranker = makeRanker(w, queries);
  const embedderId = w.index.embedding.id;
  const base = scoreThreshold(w.index, w.config);
  const flat = withThreshold(w.config, embedderId, 0);

  const oracle = ranker.run(oracleNeighbours(w.index.games, w.truthFor), flat);
  const oracleAnswered = new Set(oracle.filter((o) => !o.query.abstain && o.result.status === "ok").map((o) => queryKey(o.query)));

  const order = ["enriched", "raw_text", "rules_enriched"].filter((v) => w.inputs.variants[v]);
  const outcomes: Record<string, QueryOutcome[]> = {};
  for (const v of order) outcomes[v] = ranker.run(w.inputs.variants[v]!, w.config);
  outcomes.random = ranker.run(randomNeighbours(w.index.games), flat);
  outcomes["oracle (ceiling)"] = oracle;
  const summaries = Object.entries(outcomes).map(([v, o]) => ranker.summarise(v, o, oracleAnswered));

  const sweep: SweepPoint[] = sweepThresholds(base).map((t) => {
    const s = ranker.summarise("enriched", ranker.run(w.inputs.variants.enriched!, withThreshold(w.config, embedderId, t)), oracleAnswered);
    return { threshold: t, ndcgAt5: s.ndcgAt5, badRecommendationRate: s.badRecommendationRate, coverage: s.coverage };
  });
  const coverageGate = (w.inputs.gates.abstention as Record<string, { min?: number }> | undefined)?.coverage?.min ?? 0.8;
  const best = suggestOperatingPoint(sweep, coverageGate);
  const suggestion = best === null
    ? { threshold: null, text: `No threshold in the sweep keeps coverage at or above ${coverageGate}.` }
    : best.threshold === base
      ? null
      : { threshold: best.threshold, text: `Suggested operating point for ${embedderId}: minScore ${best.threshold} (bad-rec ${best.badRecommendationRate}, coverage ${best.coverage}, nDCG@5 ${best.ndcgAt5}); current ${base}.` };

  // Failure cases, from the shipped variant.
  const enriched = outcomes.enriched!;
  const answered = enriched.filter((o) => o.ndcg !== null);
  const caseOf = (o: QueryOutcome) => ({
    seed: o.query.gameId,
    title: w.index.games[o.query.gameId]!.title,
    context: `${o.query.brand}/${o.query.market}`,
    ndcg: r3(o.ndcg),
    seedTruth: describeTruth(w.truthFor(o.query.gameId)),
    items: o.result.items.map((i, n) => ({ gameId: i.gameId, title: i.title, score: i.score, grade: o.grades[n]!, truth: describeTruth(w.truthFor(i.gameId)) })),
  });
  const lowest: ReturnType<typeof caseOf>[] = [];
  for (const o of [...answered].sort((a, b) => a.ndcg! - b.ndcg! || queryKey(a.query).localeCompare(queryKey(b.query)))) {
    if (lowest.length >= 4) break;
    if (!lowest.some((c) => c.seed === o.query.gameId)) lowest.push(caseOf(o));
  }
  const topSlotUnrelated: ReturnType<typeof caseOf>[] = [];
  for (const o of answered) {
    if (topSlotUnrelated.length >= 4) break;
    if (o.grades[0] === 0 && !topSlotUnrelated.some((c) => c.seed === o.query.gameId)) topSlotUnrelated.push(caseOf(o));
  }

  return {
    queries: queries.length,
    abstainingQueries: queries.filter((q) => q.abstain).length,
    answerableQueries: oracleAnswered.size,
    threshold: base,
    variants: summaries,
    sweep,
    suggestion,
    failureCases: { lowestNdcg: lowest, topSlotUnrelated },
  };
}

// ---------------------------------------------------------------------------------------------
// The whole evaluation
// ---------------------------------------------------------------------------------------------

export function evaluate(inputs: EvalInputs) {
  const w = buildWorld(inputs);
  const info = informationIntegrity(w);
  const exhaustive = exhaustiveCheck(w);
  const traps = plantedTraps(w, exhaustive.served);
  const clusterVariants = ["raw_text", "enriched"].filter((v) => inputs.variants[v]);
  const clusters = clusterMetrics(w, clusterVariants);
  const ranking = rankingQuality(w);
  const shipped = ranking.variants.find((v) => v.variant === "enriched")!;
  const rawText = ranking.variants.find((v) => v.variant === "raw_text");

  const values: Record<string, number | null> = {
    ...info.gated,
    ...exhaustive.counts,
    expectedDeclineRate: shipped.expectedDeclineRate,
    coverage: shipped.coverage,
    ndcgAt5: shipped.ndcgAt5,
    ndcgLiftOverRawText: shipped.ndcgAt5 !== null && rawText?.ndcgAt5 != null ? round(shipped.ndcgAt5 - rawText.ndcgAt5, 3) : null,
    badRecommendationRate: shipped.badRecommendationRate,
  };
  const gates: GateResult = evaluateGates(values, inputs.gates);
  const failedTraps = traps.filter((t) => !t.ok);

  return {
    header: {
      mode: inputs.mode,
      indexVersion: inputs.index.indexVersion,
      builtAt: inputs.index.builtAt,
      catalogueHash: inputs.index.catalogueHash,
      enrichment: inputs.index.enrichment,
      embedding: inputs.index.embedding,
      feedRecords: w.ids.length,
      canonicalGames: inputs.canonical.length,
      rankingQueries: ranking.queries,
      variants: Object.keys(inputs.variants),
    },
    gates,
    traps: { rows: traps, handled: traps.length - failedTraps.length, total: traps.length, misses: failedTraps.map((t) => `${t.trap}: ${t.record}`) },
    clusters,
    information: { ...info.gated, ...info.reported, protectedFieldDetails: info.protectedDetails, wrongFills: info.wrongFills },
    rules: {
      exhaustiveCalls: exhaustive.calls,
      limit: exhaustive.limit,
      outcomes: exhaustive.outcomes,
      counts: exhaustive.counts,
      firstViolations: exhaustive.violations.slice(0, 10),
      removedPerRule: exhaustive.removedPerRule,
    },
    ranking,
  };
}

export type EvalReport = ReturnType<typeof evaluate>;
