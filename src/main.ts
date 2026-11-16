import { resolve } from "node:path";
import { artifactPaths } from "./config.js";
import { loadIndex } from "./service/index-store.js";
import { buildServer } from "./service/server.js";
import { loadServiceConfig } from "./service/service-config.js";

// npm start. Serves the committed OpenAI build by default; INDEX_PATH=artifacts/offline/index.json
// serves an offline one. A bad config stops the process; a bad index only makes it not ready.

const config = loadServiceConfig();
const indexPath = process.env.INDEX_PATH ? resolve(process.env.INDEX_PATH) : artifactPaths("openai").index;
const index = loadIndex(indexPath, config);

const app = buildServer({ config, index, logger: true });
if (index.ok) app.log.info({ indexVersion: index.index.indexVersion, embedding: index.index.embedding.id, path: indexPath }, "index loaded");
else app.log.error({ error: index.error }, "index not loaded: serving as not ready");

const port = Number(process.env.PORT ?? 3000);
await app.listen({ host: "127.0.0.1", port });

let closing = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, "shutting down");
    app.close().then(() => process.exit(0), () => process.exit(1));
  });
}
