import { describe, expect, it } from "vitest";
import { evaluateGates, gateExitCode, loadGates } from "../eval/gates.js";
import type { GatesFile } from "../eval/gates.js";
import { missingInputsMessage, requiredInputs } from "../eval/inputs.js";

const GATES: GatesFile = {
  _comment: "test gates",
  information: { protectedFieldViolations: { max: 0, why: "never" }, themePrecisionWhenFilled: { min: 0.7, why: "noise" } },
  ranking: { ndcgAt5: { min: 0.6, why: "quality" }, badRecommendationRate: { max: 0.15, why: "trust" } },
};
const PASSING = { protectedFieldViolations: 0, themePrecisionWhenFilled: 0.7, ndcgAt5: 0.81, badRecommendationRate: 0.15 };

describe("evaluateGates: the pure release decision (spec 06 §6, AC4)", () => {
  it("a passing set passes, and exits 0", () => {
    const result = evaluateGates(PASSING, GATES);
    expect(result.passed).toBe(true);
    expect(result.rows.map((r) => r.result)).toEqual(["PASS", "PASS", "PASS", "PASS"]);
    expect(gateExitCode(result)).toBe(0);
  });

  it("a failing set fails, and exits 1", () => {
    const result = evaluateGates({ ...PASSING, ndcgAt5: 0.549 }, GATES);
    expect(result.passed).toBe(false);
    expect(result.rows.find((r) => r.gate === "ndcgAt5")).toMatchObject({ layer: "ranking", value: 0.549, rule: "≥ 0.6", result: "FAIL" });
    expect(gateExitCode(result)).toBe(1);
  });

  it("min and max are both inclusive bounds, and each fails just beyond it", () => {
    expect(evaluateGates({ ...PASSING, themePrecisionWhenFilled: 0.667 }, GATES).passed).toBe(false);
    expect(evaluateGates({ ...PASSING, badRecommendationRate: 0.151 }, GATES).passed).toBe(false);
    expect(evaluateGates({ ...PASSING, protectedFieldViolations: 1 }, GATES).rows[0]).toMatchObject({ rule: "≤ 0", result: "FAIL" });
  });

  it("a gate with no value (n/a) fails: missing, null or NaN", () => {
    const { ndcgAt5: _omitted, ...withoutNdcg } = PASSING;
    for (const values of [withoutNdcg, { ...PASSING, ndcgAt5: null }, { ...PASSING, ndcgAt5: Number.NaN }]) {
      const result = evaluateGates(values, GATES);
      expect(result.rows.find((r) => r.gate === "ndcgAt5")).toMatchObject({ value: null, result: "FAIL" });
      expect(gateExitCode(result)).toBe(1);
    }
  });

  it("keeps the file's layer and gate order and carries each why", () => {
    const rows = evaluateGates(PASSING, GATES).rows;
    expect(rows.map((r) => `${r.layer}.${r.gate}`)).toEqual(["information.protectedFieldViolations", "information.themePrecisionWhenFilled", "ranking.ndcgAt5", "ranking.badRecommendationRate"]);
    expect(rows.every((r) => r.why.length > 0)).toBe(true);
  });
});

describe("eval/release-gates.json", () => {
  const gates = loadGates();

  it("holds the spec 06 §6 gates alongside spec 02's, each with a why", () => {
    const rows = evaluateGates({}, gates).rows;
    const rule = (key: string) => rows.find((r) => r.gate === key);
    expect(rule("offVocabularyTagsInOutput")).toMatchObject({ layer: "information", rule: "≤ 0" });
    expect(rule("injectionLeaks")).toMatchObject({ layer: "information", rule: "≤ 0" });
    expect(rule("gameTypeAccuracyWhenFilled")).toMatchObject({ layer: "information", rule: "≥ 0.9" });
    expect(rule("themePrecisionWhenFilled")).toMatchObject({ layer: "information", rule: "≥ 0.7" });
    expect(rule("ndcgAt5")).toMatchObject({ layer: "ranking", rule: "≥ 0.6" });
    expect(rule("ndcgLiftOverRawText")).toMatchObject({ layer: "ranking", rule: "≥ 0" });
    expect(rule("badRecommendationRate")).toMatchObject({ layer: "ranking", rule: "≤ 0.15" });
    expect(rows).toHaveLength(15);
    expect(rows.every((r) => r.why.length > 20)).toBe(true);
    // With no values at all, every gate is n/a and fails.
    expect(rows.every((r) => r.result === "FAIL")).toBe(true);
  });
});

describe("missing build inputs (spec 06 §2)", () => {
  it("names each missing file and the command that builds it, without falling back", () => {
    const msg = missingInputsMessage("openai", (p) => !p.endsWith("index.json"));
    expect(msg).toContain("artifacts/index.json");
    expect(msg).toContain("npm run build:index -- --provider=openai");
    expect(msg).not.toContain("artifacts/offline/index.json");
    expect(msg).toContain("--provider=offline"); // how to ask for the other build, not a fallback
  });

  it("is null when every input exists, and covers the seven inputs of the chosen build", () => {
    expect(missingInputsMessage("offline", () => true)).toBeNull();
    const offline = requiredInputs("offline").map((f) => f.path.replace(/\\/g, "/"));
    expect(offline).toHaveLength(7);
    expect(offline.filter((p) => /data\/offline\/|artifacts\/offline\//.test(p))).toHaveLength(6);
    expect(missingInputsMessage("offline", (p) => !p.includes("eval-reference"))).toMatch(/eval-reference\.json \(build it with: npm run generate -- --provider=offline\)/);
  });
});
