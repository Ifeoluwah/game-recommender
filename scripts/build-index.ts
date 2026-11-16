import { existsSync, readFileSync } from "node:fs";
import { ENRICHMENT_CACHE_PATH, ENV_FILE, artifactPaths, dataPaths } from "../src/config.js";
import { HashingEmbedder, OpenAiEmbedder, OpenAiJsonLlm, resolveProviderMode } from "../src/ai/providers.js";
import type { Embedder } from "../src/ai/providers.js";
import type { RawRecord } from "../src/domain/types.js";
import { buildIndex, enrichedEmbeddingText, neighboursFor, rawEmbeddingText } from "../src/pipeline/build-index.js";
import type { BuildEnrichment, NeighbourLists } from "../src/pipeline/build-index.js";
import { ENRICH_PROMPT_VERSION, FileEnrichmentCache, RULES_PROMPT_VERSION, enrichCatalogue } from "../src/pipeline/enrich.js";
import { normaliseRecord } from "../src/pipeline/normalise.js";
import { jsonFileText, loadEnvIfPresent, sha256, writeFileAtomic } from "../src/util/misc.js";

// npm run build:index -- --provider=openai|offline
// The only place models are called for the service (spec 05 §4). Reads the mode's raw feed, never the
// canonical catalogue or the reference data (AGENTS.md rule 9).

loadEnvIfPresent(ENV_FILE);
const { mode, reason } = resolveProviderMode(process.argv.slice(2));
console.log(`provider: ${mode} (${reason})`);

const data = dataPaths(mode);
if (!existsSync(data.rawFeed)) {
  console.error(`missing ${data.rawFeed}: run npm run generate -- --provider=${mode}`);
  process.exit(1);
}

// 1. The raw feed exactly as written: its bytes are the catalogue's identity.
const rawText = readFileSync(data.rawFeed, "utf8");
const catalogueHash = sha256(rawText).slice(0, 16);
const normalised = (JSON.parse(rawText) as RawRecord[]).map((r) => normaliseRecord(r));

// 2. Enrichment: the model with the cache in OpenAI mode, the rules enricher offline (no cache file).
const llm = mode === "openai" ? new OpenAiJsonLlm() : undefined;
const { games: enriched, stats } = await enrichCatalogue(normalised, {
  llm,
  cache: llm ? new FileEnrichmentCache(ENRICHMENT_CACHE_PATH) : undefined,
});
console.log(`enrichment: ${JSON.stringify(stats)}`);
if (stats.fallbacks > 0) console.warn(`warning: ${stats.fallbacks} record(s) fell back to the rules enricher; see enrichment.error in enriched-catalogue.json`);

const enrichment: BuildEnrichment = llm
  ? { method: "llm", model: llm.id, promptVersion: ENRICH_PROMPT_VERSION }
  : { method: "rules", model: null, promptVersion: RULES_PROMPT_VERSION };

// 3. The index.
const embedder: Embedder = mode === "openai" ? new OpenAiEmbedder() : new HashingEmbedder();
const index = await buildIndex(enriched, embedder, { catalogueHash, enrichment });

// 4. Evaluation variants, embedded with the same embedder so the comparison is fair.
const ids = normalised.map((g) => g.id);
const variants: Record<string, NeighbourLists> = {
  enriched: index.neighbours,
  raw_text: await neighboursFor(ids, normalised.map(rawEmbeddingText), embedder),
};
if (llm) {
  const { games: rulesEnriched } = await enrichCatalogue(normalised);
  variants.rules_enriched = await neighboursFor(ids, rulesEnriched.map(enrichedEmbeddingText), embedder);
}

// 5. Atomic writes: a killed build never leaves a half-written artefact behind.
const out = artifactPaths(mode);
writeFileAtomic(out.enrichedCatalogue, jsonFileText(enriched));
writeFileAtomic(out.evalVariants, jsonFileText({ indexVersion: index.indexVersion, embedding: index.embedding, variants }));
// The index last, so a reader that sees a new index also finds its matching variants.
writeFileAtomic(out.index, jsonFileText(index));

console.log(
  `index ${index.indexVersion}: ${Object.keys(index.games).length} games, embedder ${embedder.id}, catalogueHash ${catalogueHash}, variants ${Object.keys(variants).join(", ")} → ${out.dir}`,
);
