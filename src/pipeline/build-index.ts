import type { Embedder } from "../ai/providers.js";
import { INDEX_SCHEMA_VERSION, IndexSchema } from "../domain/index-schema.js";
import type { RecommendationIndex, ServiceGame } from "../domain/index-schema.js";
import type { EnrichedGame, NormalisedGame } from "../domain/types.js";
import { round, sha256, stableStringify } from "../util/misc.js";

/**
 * The build-time half of the split (spec 05 §4): embedding text, exact nearest neighbours and the
 * validated service artefact. The service only ever loads what this writes.
 */

export { IndexSchema };

/** Appendix A16 verbatim. Guarded structured fields plus the neutral summary, never the raw description. */
export function enrichedEmbeddingText(g: EnrichedGame): string {
  return [
    `Title: ${g.title}.`,
    g.gameType ? `Type: ${g.gameType}.` : "",
    g.themes.length ? `Themes: ${g.themes.join(", ")}.` : "",
    g.mechanics.length ? `Mechanics: ${g.mechanics.join(", ")}.` : "",
    g.volatility ? `Volatility: ${g.volatility}.` : "",
    g.reelLayout ? `Layout: ${g.reelLayout}.` : "",
    g.jackpotNetwork ? `Jackpot network: ${g.jackpotNetwork}.` : "",
    g.matchingSummary ? `Summary: ${g.matchingSummary}` : "",
  ].filter(Boolean).join(" ");
}

/** Baseline text: what you would embed if you skipped enrichment and used the source as-is. */
export function rawEmbeddingText(g: NormalisedGame): string {
  return [g.title, g.gameType ?? "", [...g.themes, ...g.mechanics, ...g.unknownTags].join(" "), g.reelLayout ?? "", g.jackpotNetwork ?? "", g.description].filter(Boolean).join(". ");
}

export const NEIGHBOURS_PER_GAME = 40;
export const SCORE_DECIMALS = 4;

export type NeighbourLists = Record<string, Array<[string, number]>>;

const cosine = (a: readonly number[], b: readonly number[]): number => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number, y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  // An empty text embeds to the zero vector: similar to nothing.
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
};

/**
 * Exact cosine over all pairs, self excluded; top 40, scores rounded to 4 dp, sorted by rounded score
 * descending then id ascending, so ties are deterministic. O(n²) is fine at this scale (the ADR
 * names the trigger for approximate search).
 */
export function exactNeighbours(ids: readonly string[], vectors: readonly number[][], k = NEIGHBOURS_PER_GAME): NeighbourLists {
  if (ids.length !== vectors.length) throw new Error(`${ids.length} ids but ${vectors.length} vectors`);
  if (new Set(ids).size !== ids.length) throw new Error("duplicate game ids: one index entry per feed record");
  const out: NeighbourLists = {};
  ids.forEach((id, i) => {
    const scored: Array<[string, number]> = [];
    ids.forEach((other, j) => {
      if (i !== j) scored.push([other, round(cosine(vectors[i] as number[], vectors[j] as number[]), SCORE_DECIMALS)]);
    });
    scored.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    out[id] = scored.slice(0, k);
  });
  return out;
}

/** Embed `texts` (one per game, in `ids` order) and return their neighbour lists. */
export async function neighboursFor(ids: readonly string[], texts: string[], embedder: Embedder): Promise<NeighbourLists> {
  const vectors = await embedder.embed(texts);
  if (vectors.length !== texts.length) throw new Error(`${embedder.id} returned ${vectors.length} vectors for ${texts.length} texts`);
  return exactNeighbours(ids, vectors);
}

/** Source facts from the normalised record (the guard never changes them); matching fields from the guarded record. */
export function toServiceGame(g: EnrichedGame): ServiceGame {
  return {
    id: g.id,
    title: g.title,
    provider: g.provider,
    gameType: g.gameType,
    seriesId: g.seriesId,
    dedupeKey: g.dedupeKey,
    brands: g.brands,
    markets: g.markets,
    status: g.status,
    isTestGame: g.isTestGame,
    seasonMonths: g.seasonMonths,
    insufficient: g.enrichment.insufficient,
    volatility: g.volatility,
    maxStake: g.maxStake,
    minStake: g.minStake,
    mechanics: g.mechanics,
  };
}

/** How the build was run, not each record (spec 05 §4.3). */
export interface BuildEnrichment {
  method: string;
  model: string | null;
  promptVersion: string;
}

export interface BuildIndexOptions {
  /** First 16 hex chars of sha256 of the raw feed file's text. */
  catalogueHash: string;
  enrichment: BuildEnrichment;
  now?: () => Date;
}

export const indexVersionOf = (catalogueHash: string, enrichment: BuildEnrichment, embeddingId: string, neighbours: NeighbourLists): string =>
  sha256(stableStringify({ catalogueHash, enrichment, embeddingId, neighbours })).slice(0, 12);

export async function buildIndex(enriched: readonly EnrichedGame[], embedder: Embedder, opts: BuildIndexOptions): Promise<RecommendationIndex> {
  const ids = enriched.map((g) => g.id);
  const neighbours = await neighboursFor(ids, enriched.map(enrichedEmbeddingText), embedder);
  const index = {
    schemaVersion: INDEX_SCHEMA_VERSION,
    indexVersion: indexVersionOf(opts.catalogueHash, opts.enrichment, embedder.id, neighbours),
    builtAt: (opts.now ?? (() => new Date()))().toISOString(),
    catalogueHash: opts.catalogueHash,
    enrichment: opts.enrichment,
    embedding: { id: embedder.id, dim: embedder.dim },
    games: Object.fromEntries(enriched.map((g) => [g.id, toServiceGame(g)])),
    neighbours,
  };
  // Validated on write as well as on load: a build that can't produce a valid artefact fails here.
  return IndexSchema.parse(index);
}
