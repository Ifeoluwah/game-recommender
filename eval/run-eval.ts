import { readFileSync } from "node:fs";
import { artifactPaths, buildModeToRead, dataPaths, evaluationLabelPaths, reportPaths } from "../src/config.js";
import type { BuildMode } from "../src/config.js";
import type { ReferenceEntry } from "../src/catalogue/degrade.js";
import { CanonicalGameSchema } from "../src/domain/types.js";
import type { EnrichedGame, RawRecord } from "../src/domain/types.js";
import { loadIndex } from "../src/service/index-store.js";
import { loadServiceConfig } from "../src/service/service-config.js";
import { jsonFileText, sha256, writeFileAtomic } from "../src/util/misc.js";
import { evaluate } from "./evaluate.js";
import type { Neighbours } from "./evaluate.js";
import { gateExitCode, loadGates } from "./gates.js";
import { missingInputsMessage, repoRelative } from "./inputs.js";
import { clusterMacroLine, gateTableText, noRailsLine, renderMarkdown, trapLine } from "./report.js";

// npm run eval [-- --provider=offline]     the report
// npm run eval:gate [-- --provider=offline] the report, then exit 1 if any release gate fails
// Reads the artefacts of ONE build (the committed OpenAI build by default) and never falls back to
// the other. No model calls: deterministic for a given set of artefacts (spec 06 §8).

const argv = process.argv.slice(2);
const gateMode = argv.includes("--gate");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let mode: BuildMode;
try {
  mode = buildModeToRead(argv);
} catch (err) {
  fail((err as Error).message);
}

const data = dataPaths(mode), labels = evaluationLabelPaths(mode), art = artifactPaths(mode);
const rel = repoRelative;
const build = `npm run build:index -- --provider=${mode}`;
const missing = missingInputsMessage(mode);
if (missing) fail(missing);

const readJson = <T>(path: string): T => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (err) {
    fail(`${rel(path)} is not valid JSON: ${(err as Error).message}`);
  }
};

const config = loadServiceConfig();
const loaded = loadIndex(art.index, config);
if (!loaded.ok) fail(`${loaded.error}. Rebuild the index: ${build}`);
const index = loaded.index;

const variantsFile = readJson<{ indexVersion: string; variants: Record<string, Neighbours> }>(art.evalVariants);
if (variantsFile.indexVersion !== index.indexVersion) {
  fail(`${rel(art.evalVariants)} is for index ${variantsFile.indexVersion}, but ${rel(art.index)} is ${index.indexVersion}: rebuild the index (${build}).`);
}
if (!variantsFile.variants?.enriched || !variantsFile.variants.raw_text) fail(`${rel(art.evalVariants)} lacks the enriched or raw_text variant: rebuild the index (${build}).`);

const rawText = readFileSync(data.rawFeed, "utf8");
if (sha256(rawText).slice(0, 16) !== index.catalogueHash) {
  fail(`${rel(data.rawFeed)} doesn't match the index (catalogueHash ${index.catalogueHash}): the data was regenerated after the index was built. Rebuild the index (${build}).`);
}

const report = evaluate({
  mode,
  canonical: CanonicalGameSchema.array().parse(readJson(labels.canonical)),
  reference: readJson<ReferenceEntry[]>(labels.reference),
  raw: JSON.parse(rawText) as RawRecord[],
  enriched: readJson<EnrichedGame[]>(art.enrichedCatalogue),
  index,
  variants: variantsFile.variants,
  config,
  gates: loadGates(),
});

const out = reportPaths(mode);
writeFileAtomic(out.markdown, renderMarkdown(report));
writeFileAtomic(out.json, jsonFileText(report));

console.log(`Evaluated the ${mode} build: index ${index.indexVersion}, ${report.header.feedRecords} records, ${report.header.rankingQueries} ranking queries.`);
if (mode === "offline") console.log("Offline build: the keyless stand-in, not the shipped configuration. Ranking-gate failures are expected.");
console.log("");
console.log(gateTableText(report));
console.log("");
console.log(clusterMacroLine(report));
console.log(trapLine(report));
const noRails = noRailsLine(report);
if (noRails) console.log(noRails);
// Nothing to say when the current threshold is already the suggested operating point (spec 06 §5.3).
if (report.ranking.suggestion) console.log(report.ranking.suggestion.text);
console.log(`Report: ${rel(out.markdown)} (and ${rel(out.json)})`);

if (gateMode) process.exit(gateExitCode(report.gates));
