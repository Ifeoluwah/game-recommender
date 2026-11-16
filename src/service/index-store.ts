import { readFileSync } from "node:fs";
import { IndexSchema } from "../domain/index-schema.js";
import type { RecommendationIndex } from "../domain/index-schema.js";
import { errorMessage } from "../util/misc.js";
import type { ServiceConfig } from "./service-config.js";

export type LoadIndexResult = { ok: true; index: RecommendationIndex } | { ok: false; error: string };

/**
 * Load and validate an index artefact (spec 05 §5). Never throws: a bad artefact makes the process
 * not ready rather than crashed, so a load balancer keeps sending traffic to instances still holding
 * the previous good version.
 */
export function loadIndex(path: string, config: ServiceConfig): LoadIndexResult {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return { ok: false, error: code === "ENOENT" ? `index not found at ${path}` : `index at ${path} could not be read: ${errorMessage(err)}` };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `index at ${path} is not valid JSON: ${errorMessage(err)}` };
  }

  const parsed = IndexSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    return { ok: false, error: `index at ${path} failed validation: ${issues.join("; ")}` };
  }

  const embedder = parsed.data.embedding.id;
  if (config.recommendation.minScoreByEmbedder[embedder] === undefined) {
    return { ok: false, error: `index at ${path} uses embedder "${embedder}", which has no score threshold in the service config (recommendation.minScoreByEmbedder)` };
  }
  return { ok: true, index: parsed.data };
}
