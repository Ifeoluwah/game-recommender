import { existsSync } from "node:fs";
import { relative } from "node:path";
import { REPO_ROOT, SERVICE_CONFIG_PATH, artifactPaths, dataPaths, evaluationLabelPaths } from "../src/config.js";
import type { BuildMode } from "../src/config.js";

/** The files one build's evaluation reads (spec 06 §2), each with the command that creates it. */
export function requiredInputs(mode: BuildMode): Array<{ path: string; command: string }> {
  const data = dataPaths(mode), labels = evaluationLabelPaths(mode), art = artifactPaths(mode);
  const generate = `npm run generate -- --provider=${mode}`, build = `npm run build:index -- --provider=${mode}`;
  return [
    { path: labels.canonical, command: generate },
    { path: labels.reference, command: generate },
    { path: data.rawFeed, command: generate },
    { path: art.enrichedCatalogue, command: build },
    { path: art.index, command: build },
    { path: art.evalVariants, command: build },
    { path: SERVICE_CONFIG_PATH, command: "restore config/service.json from git" },
  ];
}

export const repoRelative = (p: string): string => relative(REPO_ROOT, p).replace(/\\/g, "/");

/**
 * null when every input exists; otherwise the message to exit with, naming each missing file and the
 * command that builds it. Never suggests reading the other build in its place, only how to ask for it.
 */
export function missingInputsMessage(mode: BuildMode, exists: (path: string) => boolean = existsSync): string | null {
  const missing = requiredInputs(mode).filter((f) => !exists(f.path));
  if (missing.length === 0) return null;
  const hint = mode === "openai" ? "\nThe OpenAI build isn't present. To evaluate the keyless stand-in instead, ask for it explicitly: npm run eval -- --provider=offline" : "";
  return `Cannot evaluate the ${mode} build: missing ${missing.map((f) => `${repoRelative(f.path)} (build it with: ${f.command})`).join("; ")}.${hint}`;
}
