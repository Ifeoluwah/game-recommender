import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Brands and the paths of every build output. This is the only file in src/ allowed to name the
 * evaluation-label files (AGENTS.md rule 9; enforced by tests/boundaries.test.ts).
 */

/** Brand order matters to the operational draws (appendix A6, A15). */
export const KNOWN_BRANDS = ["aurora", "harbour", "meridian", "liberty"] as const;
export const EU_BRANDS = ["aurora", "harbour", "meridian"] as const;

export const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
export const PROMPTS_DIR = join(REPO_ROOT, "prompts");
export const ENV_FILE = join(REPO_ROOT, ".env");
export const SERVICE_CONFIG_PATH = join(REPO_ROOT, "config", "service.json");

/** openai = the shipped, committed build; offline = the keyless stand-in, git-ignored (spec 05 §3). */
export type BuildMode = "openai" | "offline";

const DATA_DIR: Record<BuildMode, string> = { openai: "data/generated", offline: "data/offline" };
const ARTIFACTS_DIR: Record<BuildMode, string> = { openai: "artifacts", offline: "artifacts/offline" };
const REPORTS_DIR: Record<BuildMode, string> = { openai: "eval/reports", offline: "eval/reports/offline" };

/** Files the pipeline may read and write. */
export function dataPaths(mode: BuildMode) {
  const dir = join(REPO_ROOT, DATA_DIR[mode]);
  return { dir, rawFeed: join(dir, "catalogue.raw.json"), manifest: join(dir, "manifest.json") };
}

/**
 * The answers: the clean catalogue and the record of what degradation did. Only the generate script
 * (which writes them) and the evaluation may use these paths.
 */
export function evaluationLabelPaths(mode: BuildMode) {
  const dir = join(REPO_ROOT, DATA_DIR[mode]);
  return { canonical: join(dir, "catalogue.canonical.json"), reference: join(dir, "eval-reference.json") };
}

export function artifactPaths(mode: BuildMode) {
  const dir = join(REPO_ROOT, ARTIFACTS_DIR[mode]);
  return {
    dir,
    index: join(dir, "index.json"),
    enrichedCatalogue: join(dir, "enriched-catalogue.json"),
    evalVariants: join(dir, "eval-variants.json"),
  };
}

export function reportPaths(mode: BuildMode) {
  const dir = join(REPO_ROOT, REPORTS_DIR[mode]);
  return { dir, markdown: join(dir, "latest.md"), json: join(dir, "latest.json") };
}
