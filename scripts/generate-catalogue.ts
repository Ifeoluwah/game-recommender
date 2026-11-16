import { ENV_FILE, dataPaths, evaluationLabelPaths } from "../src/config.js";
import { OpenAiJsonLlm, resolveProviderMode } from "../src/ai/providers.js";
import { generateDataset } from "../src/catalogue/dataset.js";
import { jsonFileText, loadEnvIfPresent, writeFileAtomic } from "../src/util/misc.js";

// npm run generate -- --provider=openai|offline
// openai writes the committed dataset to data/generated/; offline writes the stand-in to data/offline/.

loadEnvIfPresent(ENV_FILE);
const { mode, reason } = resolveProviderMode(process.argv.slice(2));
console.log(`provider: ${mode} (${reason})`);

const dataset = await generateDataset({ llm: mode === "openai" ? new OpenAiJsonLlm() : undefined });

const data = dataPaths(mode);
const labels = evaluationLabelPaths(mode);
writeFileAtomic(data.rawFeed, jsonFileText(dataset.raw));
writeFileAtomic(labels.canonical, jsonFileText(dataset.canonical));
writeFileAtomic(labels.reference, jsonFileText(dataset.reference));
writeFileAtomic(data.manifest, jsonFileText(dataset.manifest));

console.log(`${dataset.canonical.length} canonical games, ${dataset.raw.length} feed records → ${data.dir}`);
