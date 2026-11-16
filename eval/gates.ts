import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { REPO_ROOT } from "../src/config.js";

/**
 * Release gates (spec 06 §6). The thresholds are data in eval/release-gates.json; this is the pure
 * decision over them, kept apart from the runner so it can be tested on passing and failing values
 * (no offline build passes every gate end to end, spec 06 AC4).
 */

export const RELEASE_GATES_PATH = join(REPO_ROOT, "eval", "release-gates.json");

const GateSchema = z.union([
  z.object({ min: z.number(), why: z.string().min(1) }).strict(),
  z.object({ max: z.number(), why: z.string().min(1) }).strict(),
]);
export type Gate = z.infer<typeof GateSchema>;

/** `_comment`, then layer → gate key → `{ min | max, why }`, in report order. */
export type GatesFile = { _comment: string } & Record<string, Record<string, Gate> | string>;

export const GatesFileSchema = z
  .object({ _comment: z.string().min(1) })
  .catchall(z.record(GateSchema)) as unknown as z.ZodType<GatesFile>;

export function loadGates(path: string = RELEASE_GATES_PATH): GatesFile {
  return GatesFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

/** Layers and their gates, in file order, without the comment. */
export function gateLayers(gates: GatesFile): Array<[layer: string, entries: Array<[key: string, gate: Gate]>]> {
  return Object.entries(gates)
    .filter(([k]) => k !== "_comment")
    .map(([layer, group]) => [layer, Object.entries(group as Record<string, Gate>)]);
}

export interface GateRow {
  layer: string;
  gate: string;
  /** null when the run produced no value (n/a). */
  value: number | null;
  rule: string;
  result: "PASS" | "FAIL";
  why: string;
}

export interface GateResult {
  rows: GateRow[];
  passed: boolean;
}

export const gateRule = (g: Gate): string => ("min" in g ? `≥ ${g.min}` : `≤ ${g.max}`);

/**
 * Every gate in the file is judged; a gate with no value (missing, null or not a finite number)
 * fails, so a metric that silently stops being computed can't pass a release.
 */
export function evaluateGates(values: Readonly<Record<string, number | null | undefined>>, gates: GatesFile): GateResult {
  const rows: GateRow[] = [];
  for (const [layer, entries] of gateLayers(gates)) {
    for (const [key, gate] of entries) {
      const raw = values[key];
      const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
      const pass = value !== null && ("min" in gate ? value >= gate.min : value <= gate.max);
      rows.push({ layer, gate: key, value, rule: gateRule(gate), result: pass ? "PASS" : "FAIL", why: gate.why });
    }
  }
  return { rows, passed: rows.every((r) => r.result === "PASS") };
}

/** `npm run eval:gate`: 1 when any gate fails, 0 otherwise. */
export const gateExitCode = (result: GateResult): 0 | 1 => (result.passed ? 0 : 1);
