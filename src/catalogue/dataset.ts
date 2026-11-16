import type { JsonLlm } from "../ai/providers.js";
import { CanonicalGameSchema } from "../domain/types.js";
import type { CanonicalGame, RawRecord } from "../domain/types.js";
import type { RetryOptions } from "../util/misc.js";
import { GENERATE_PROMPT_VERSION, assertUniqueTitleStudio, generateOffline, generateWithLlm } from "./creative.js";
import { assembleCanonical, degrade, idForSlot } from "./degrade.js";
import type { ReferenceEntry } from "./degrade.js";
import { BENCHMARK_CLUSTERS, buildSlate } from "./slate.js";
import { addTrapGames } from "./traps.js";

/**
 * The whole dataset pipeline in memory: slate → creative → operational fields → trap games → degradation.
 * The generate script writes its result to disk; tests call it directly, so both run the same code.
 */

export const SEEDS = { slate: 42, offlineCreative: 7, operational: 99, degradation: 1234, traps: 777 } as const;
/** Cold-start releases are dated to this, never the wall clock, so output stays reproducible. */
export const DEFAULT_TODAY = "2026-11-10";

export interface Dataset {
  canonical: CanonicalGame[];
  raw: RawRecord[];
  reference: ReferenceEntry[];
  manifest: Record<string, unknown>;
}

export interface DatasetOptions {
  /** Omit for the offline stand-in. */
  llm?: JsonLlm;
  today?: string;
  now?: () => Date;
  retry?: RetryOptions;
  /** System prompt override (tests); defaults to the versioned prompt file. */
  system?: string;
}

export async function generateDataset(opts: DatasetOptions = {}): Promise<Dataset> {
  const slate = buildSlate(SEEDS.slate);
  const llmRun = opts.llm ? await generateWithLlm(slate, opts.llm, { retry: opts.retry, system: opts.system }) : null;
  const creative = llmRun ? llmRun.games : generateOffline(slate, SEEDS.offlineCreative);
  assertUniqueTitleStudio(creative);

  const traps = addTrapGames(assembleCanonical(creative, slate, SEEDS.operational), SEEDS.traps);
  const canonical = traps.canonical;
  // Validate without replacing: Zod's output reorders keys, and file bytes must not depend on the schema.
  CanonicalGameSchema.array().parse(canonical);

  const misleadingTitleIds = new Set(slate.filter((s) => s.misleadingTitle).map((s) => idForSlot(s.slot)));
  const { raw, reference } = degrade(canonical, {
    seed: SEEDS.degradation,
    misleadingTitleIds,
    today: opts.today ?? DEFAULT_TODAY,
    forcedSpecials: traps.specials,
    anchors: traps.anchors,
    anchorOf: traps.anchorOf,
  });

  const offline = !llmRun;
  const manifest = {
    provider: offline ? "offline" : "openai",
    model: opts.llm?.id ?? null,
    promptVersion: offline ? null : GENERATE_PROMPT_VERSION,
    ...(offline
      ? { note: "offline stand-in: procedurally generated, keyless and deterministic. Not the submitted dataset; for software tests only (spec 01 §6.4)." }
      : {}),
    seeds: { ...SEEDS, offlineCreative: offline ? SEEDS.offlineCreative : null },
    generatedAt: (opts.now ?? (() => new Date()))().toISOString(),
    counts: { canonicalGames: canonical.length, feedRecords: raw.length },
    // Everything changed after the model answered (spec 01 §6.2; LLM path only).
    ...(llmRun ? { repairs: llmRun.repairs } : {}),
    evaluation_dimensions: evaluationDimensions(canonical, reference),
  };
  return { canonical, raw, reference, manifest };
}

const countBy = <T>(items: readonly T[], key: (item: T) => string | string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const item of items) for (const k of ([] as string[]).concat(key(item))) out[k] = (out[k] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
};

/** Every count names its denominator: canonical games or feed records (spec 03 §6). */
export function evaluationDimensions(canonical: CanonicalGame[], reference: ReferenceEntry[]) {
  // A game's own record (rawId === canonicalId) carries its per-game labels.
  const perGame = reference.filter((r) => r.rawId === r.canonicalId);
  return {
    note: `${canonical.length} canonical games are represented by ${reference.length} feed records; the difference is duplicate exports and RTP variants, which ingestion must recognise as the same game.`,
    perCanonicalGame: {
      denominator: canonical.length,
      gameType: countBy(canonical, (g) => g.gameType),
      volatility: countBy(canonical, (g) => g.volatility),
      series: countBy(canonical, (g) => g.seriesId ?? "none"),
      benchmarkClusters: BENCHMARK_CLUSTERS.map((c) => ({
        id: c.id,
        label: c.label,
        members: canonical.filter((g) => g.benchmarkCluster === c.id && g.clusterRole === "member").length,
        nearMisses: canonical.filter((g) => g.benchmarkCluster === c.id && g.clusterRole === "near_miss").length,
      })),
      marketProfile: countBy(perGame, (r) => r.labels.marketProfile),
      brandScope: countBy(perGame, (r) => r.labels.brandScope),
      distribution: countBy(perGame, (r) => r.labels.distribution),
    },
    perFeedRecord: {
      denominator: reference.length,
      qualityProfile: countBy(reference, (r) => r.profile),
      trapTypes: countBy(reference, (r) => (r.specials.length ? r.specials : ["none"])),
    },
  };
}
