import { z } from "zod";
import { GAME_TYPES, MARKETS, MECHANICS, THEMES, VOLATILITIES } from "./vocabulary.js";
import type { GameType, Market, Mechanic, Theme, Volatility } from "./vocabulary.js";

export const CanonicalGameSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** The studio that built the game: this identifies the game. */
  provider: z.string(),
  /** The aggregator that distributes it, if any. */
  aggregator: z.string().nullable(),
  gameType: z.enum(GAME_TYPES),
  themes: z.array(z.enum(THEMES)).min(1),
  mechanics: z.array(z.enum(MECHANICS)),
  volatility: z.enum(VOLATILITIES),
  rtp: z.number(),
  minStake: z.number(),
  maxStake: z.number(),
  /** Reel/board layout, including win lines or ways for slots, e.g. "5x3, 20 lines". */
  reelLayout: z.string(),
  maxWinMultiplier: z.number(),
  jackpotNetwork: z.string().nullable(),
  releaseYear: z.number().int(),
  description: z.string(),
  seriesId: z.string().nullable(),
  brands: z.array(z.string()),
  markets: z.array(z.enum(MARKETS)),
  status: z.enum(["active", "withdrawn", "suspended", "certification_expired", "demo_only"]),
  isTestGame: z.boolean(),
  /** Seasonal titles may only be promoted in these months (1-12); null = all year. */
  seasonMonths: z.array(z.number().int().min(1).max(12)).nullable(),
  /** Benchmark cluster (evaluation design only), and whether this game is a member or a deliberate near-miss. */
  benchmarkCluster: z.string().nullable(),
  clusterRole: z.enum(["member", "near_miss"]).nullable(),
});
export type CanonicalGame = z.infer<typeof CanonicalGameSchema>;

/**
 * One record of the upstream supplier/CMS feed, BEFORE validation.
 *
 * Every field is optional and typed `unknown` on purpose: this is an unvalidated external feed,
 * and the only code allowed to read it is `normaliseRecord`, which turns it into a typed
 * `NormalisedGame` or records an issue. The comments show shapes actually seen in the feed.
 */
export interface RawGameRecord {
  game_id?: unknown;            // "g-012", "g-012-cms2" (duplicate export), "g-012-rtp94" (RTP variant)
  name?: unknown;               // "  Gold Rush™ ", "GOLD RUSH", "Gold Rush 94", "GAME_8842_V1"
  studio?: unknown;             // "Kestrel Play", "KESTREL PLAY", "Kestrel Play Ltd", "Unknown", missing, or an aggregator by mistake
  aggregator?: unknown;         // "Nexus Distribution", missing, or the studio's name by mistake (swapped)
  category?: unknown;           // "Video Slot", "Blackjack/Roulette", "Scratchcards", missing
  tags?: unknown;               // ["Ancient Egypt", "Free Spins"] | "egypt;Hold & Win|🔥 HOT" | ["Slots", "High Volatility"]
  volatility?: unknown;         // "Med", "3/5", "HIGH", "Very High", "EXTREME", missing
  description?: unknown;        // rich copy, "<p>html</p>", hype only, Spanish, "" | null, or a prompt injection
  rtp?: unknown;                // 96.21 | "96.21%" | "0.9621" | "96,21" | missing   (authoritative only)
  max_bet?: unknown;            // 100 | "£500" | "500.00"                            (authoritative only)
  min_bet?: unknown;            // 0.1 | "£0.10" | "10p"                              (authoritative only)
  release?: unknown;            // "2019" | "2019-03-01" | 2019
  franchise?: unknown;          // "sands of khepri"
  specs?: unknown;              // { reels | layout | grid, max_win | maxWin, jackpot | jackpot_network }
  reel_layout?: unknown;        // flat alternative to specs
  max_win_multiplier?: unknown; // "5,000x" | "x5000" | 5000                          (authoritative only)
  jackpot_network?: unknown;
  brands?: unknown;             // ["aurora", "harbour"] | "aurora,harbour"
  markets?: unknown;            // ["GB", "SE"] | "UK;SE" | missing (=> available nowhere)
  status?: unknown;             // "live" | "ACTIVE" | "SUSPENDED" | "CERTIFICATION_EXPIRED" | "DEMO_ONLY" | missing
  is_test_game?: unknown;       // true | "Y"
  available_months?: unknown;   // [11, 12, 1]  (seasonal titles)
  last_updated?: unknown;
  [field: string]: unknown;     // suppliers add fields without notice
}
/** Alias kept for readability where the record is just passed through. */
export type RawRecord = RawGameRecord;

export type Provenance = "source" | "llm" | "rules" | "missing";

/** Deterministically cleaned record. No AI involved yet. */
export interface NormalisedGame {
  id: string;
  title: string;
  dedupeKey: string;
  provider: string | null;
  aggregator: string | null;
  gameType: GameType | null;
  themes: Theme[];
  mechanics: Mechanic[];
  volatility: Volatility | null;
  rtp: number | null;
  maxStake: number | null;
  minStake: number | null;
  releaseYear: number | null;
  /** From the supplier "specs" blob when present. Evidence for matching; maxWin is never inferred. */
  reelLayout: string | null;
  maxWin: number | null;
  jackpotNetwork: string | null;
  description: string;
  seriesId: string | null;
  brands: string[];
  markets: Market[];
  /** Anything other than an explicit live status (incl. suspended, expired, demo, missing) is "withdrawn". */
  status: "active" | "withdrawn";
  isTestGame: boolean;
  seasonMonths: number[] | null;
  unknownTags: string[];
  issues: string[];
  sourceHash: string;
}

/**
 * How a record was enriched. "skipped_complete" comes from the evidence check that runs before
 * any model call: records that already have every matching field don't need the LLM.
 */
export type EnrichmentMethod = "llm" | "rules" | "rules_fallback" | "skipped_complete";

export interface EnrichmentRecord {
  method: EnrichmentMethod;
  model: string | null;
  promptVersion: string;
  confidence: "high" | "medium" | "low";
  insufficient: boolean;
  /** Tags the enricher proposed that were outside the vocabulary (a hallucination signal). */
  rejectedTags: string[];
  /** Guard findings, e.g. promotional language removed from the summary. */
  guardFlags: string[];
  error: string | null;
  /** True when the proposal came from the enrichment cache rather than a fresh model call. */
  cached: boolean;
  /** When the proposal was produced (from the cache entry for cache hits); null for rules and skipped records. */
  proposedAt: string | null;
}

/** Normalised record with gaps filled. Matching features only — never shown to players. */
export interface EnrichedGame extends NormalisedGame {
  matchingSummary: string;
  provenance: {
    gameType: Provenance;
    themes: Provenance;
    mechanics: Provenance;
    volatility: Provenance;
  };
  enrichment: EnrichmentRecord;
}

/** What the enricher (LLM or rules) proposes, before the guard and merge. */
export interface EnrichmentProposal {
  gameType: string | null;
  themes: string[];
  mechanics: string[];
  volatility: string | null;
  matchingSummary: string;
  confidence: "high" | "medium" | "low";
  insufficientInformation: boolean;
}
