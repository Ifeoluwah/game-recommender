import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/config.js";

/**
 * Architectural rules as tests (spec 05 §10 AC3):
 * - AGENTS.md rule 9: evaluation labels never reach the system under test;
 * - AGENTS.md rule 1: no model SDK in the request path.
 */

const posix = (p: string) => p.split("\\").join("/");
const rel = (p: string) => posix(relative(REPO_ROOT, p));

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? tsFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

/**
 * Every module specifier a file loads at runtime: static, side-effect, re-export and dynamic imports.
 * `import type` / `export type` are erased by the compiler, so they load nothing and are skipped.
 */
export function importsOf(source: string): string[] {
  const code = source.replace(/\b(import|export)\s+type\s[^;]*?from\s+["'][^"']+["']/g, "");
  const out: string[] = [];
  for (const re of [/\bfrom\s+["']([^"']+)["']/g, /\bimport\s+["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g]) {
    for (const m of code.matchAll(re)) out.push(m[1] as string);
  }
  return out;
}

/**
 * Why a file breaks the label boundary, or null. Catches the file names, an import of anything in
 * eval/, a path that names the eval folder, and the config.ts path constants for the labels and reports.
 */
export function labelBoundaryProblem(source: string): string | null {
  const checks: Array<[RegExp, string]> = [
    [/catalogue\.canonical(\.json)?/, "names the canonical catalogue"],
    [/eval-reference(\.json)?/, "names the reference data"],
    [/\bevaluationLabelPaths\b/, "uses the evaluation-label path constants"],
    [/\breportPaths\b/, "uses the eval report path constants"],
  ];
  for (const [re, why] of checks) if (re.test(source)) return why;
  if (importsOf(source).some((s) => /(^|\/)eval(\/|$)/.test(s))) return "imports from eval/";
  if (/["'`](\.\.?\/)*eval["'`/]/.test(source)) return "names the eval/ folder in a path";
  return null;
}

const SRC = join(REPO_ROOT, "src");
const guarded = [
  ...tsFiles(SRC).filter((f) => rel(f) !== "src/config.ts"),
  join(REPO_ROOT, "scripts", "build-index.ts"),
  join(REPO_ROOT, "scripts", "demo.ts"),
];

describe("evaluation labels never reach the system under test (AGENTS.md rule 9)", () => {
  it("covers every file it should", () => {
    const names = guarded.map(rel);
    expect(names).toEqual(expect.arrayContaining(["scripts/build-index.ts", "scripts/demo.ts", "src/pipeline/build-index.ts", "src/service/server.ts", "src/main.ts"]));
    expect(names).not.toContain("src/config.ts");
    for (const f of guarded) expect(existsSync(f)).toBe(true);
  });

  it.each(guarded.map((f) => [rel(f), f]))("%s references no canonical catalogue, reference data or eval/ folder", (_name, file) => {
    expect(labelBoundaryProblem(readFileSync(file, "utf8"))).toBeNull();
  });

  it("the detector catches each way of reaching the labels", () => {
    expect(labelBoundaryProblem('readFileSync("data/offline/catalogue.canonical.json")')).toMatch(/canonical/);
    expect(labelBoundaryProblem('const p = "eval-reference.json";')).toMatch(/reference/);
    expect(labelBoundaryProblem('import { evaluationLabelPaths } from "../src/config.js";')).toMatch(/evaluation-label/);
    expect(labelBoundaryProblem("const { json } = reportPaths(mode);")).toMatch(/report/);
    expect(labelBoundaryProblem('import { grade } from "../../eval/relevance.js";')).toMatch(/imports from eval/);
    expect(labelBoundaryProblem('join(REPO_ROOT, "eval", "release-gates.json")')).toMatch(/eval\/ folder/);
    expect(labelBoundaryProblem('const evaluation = "evaluate"; import { x } from "./evaluator.js";')).toBeNull();
  });
});

/** Relative imports resolved to files (".js" specifiers point at ".ts" sources). */
function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(from), spec);
  for (const candidate of [base.replace(/\.js$/, ".ts"), base, `${base}.ts`, join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Everything a module loads, directly or through other repo modules: the path to each bad import. */
function forbiddenImportChains(entry: string, isForbidden: (spec: string, resolved: string | null) => boolean): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const visit = (file: string, chain: string[]) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of importsOf(readFileSync(file, "utf8"))) {
      const target = resolveImport(file, spec);
      if (isForbidden(spec, target)) problems.push([...chain, rel(file), spec].join(" → "));
      else if (target) visit(target, [...chain, rel(file)]);
    }
  };
  visit(entry, []);
  return problems;
}

const PROVIDERS = join(SRC, "ai", "providers.ts");
const aiImport = (spec: string, resolved: string | null) => spec === "openai" || spec.startsWith("openai/") || resolved === PROVIDERS;

describe("no model SDK in the request path (AGENTS.md rule 1)", () => {
  const serviceFiles = tsFiles(join(SRC, "service"));

  it("finds the service modules", () => {
    expect(serviceFiles.map(rel)).toEqual(expect.arrayContaining(["src/service/server.ts", "src/service/recommender.ts", "src/service/index-store.ts", "src/service/metrics.ts"]));
  });

  it.each(serviceFiles.map((f) => [rel(f), f]))("%s imports neither openai nor the AI providers module, directly or indirectly", (_name, file) => {
    expect(forbiddenImportChains(file, aiImport)).toEqual([]);
  });

  it("the service entry point doesn't either", () => {
    expect(forbiddenImportChains(join(SRC, "main.ts"), aiImport)).toEqual([]);
  });

  it("the check does catch a module that loads the providers (the index build script), and ignores type-only imports", () => {
    expect(forbiddenImportChains(join(REPO_ROOT, "scripts", "build-index.ts"), aiImport)).toContain("scripts/build-index.ts → ../src/ai/providers.js");
    expect(importsOf('import type { Embedder } from "../ai/providers.js";\nimport { round } from "../util/misc.js";')).toEqual(["../util/misc.js"]);
    // The pipeline's index module only names the Embedder type, so it doesn't load the SDK itself.
    expect(forbiddenImportChains(join(SRC, "pipeline", "build-index.ts"), aiImport)).toEqual([]);
  });
});
