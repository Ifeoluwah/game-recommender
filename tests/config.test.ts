import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/config.js";
import { ServiceConfigSchema, loadServiceConfig } from "../src/service/service-config.js";

describe("config/service.json", () => {
  const config = loadServiceConfig();

  it("states the spec 02 §6.1 brands, restrictions and policy", () => {
    expect(config.brands).toEqual({
      aurora: { enabled: true, markets: ["GB", "ES", "SE", "NL"] },
      harbour: { enabled: true, markets: ["GB", "ES", "SE", "NL"] },
      meridian: { enabled: false, markets: ["GB"] },
      liberty: { enabled: true, markets: ["NJ"] },
    });
    expect(config.restrictedMechanicsByMarket).toEqual({ GB: ["bonus_buy"] });
    expect(config.policy).toEqual({ maxVolatilityStepUp: 1, maxStakeMultiplier: 5, maxMinStakeMultiplier: 10 });
    expect(config.recommendation).toMatchObject({ defaultLimit: 6, maxLimit: 12, minResults: 3, maxPerProvider: 3, maxPerSeries: 2 });
    expect(config.recommendation.minScoreByEmbedder).toEqual({ "openai:text-embedding-3-small": 0.45, "hashing-v1": 0.3 });
  });

  it("rejects an unknown brand, an extra key and an inconsistent limit", () => {
    const ok = JSON.parse(readFileSync(join(REPO_ROOT, "config", "service.json"), "utf8"));
    expect(ServiceConfigSchema.safeParse(ok).success).toBe(true);
    expect(ServiceConfigSchema.safeParse({ ...ok, brands: { ...ok.brands, acme: { enabled: true, markets: ["GB"] } } }).success).toBe(false);
    expect(ServiceConfigSchema.safeParse({ ...ok, surprise: true }).success).toBe(false);
    expect(ServiceConfigSchema.safeParse({ ...ok, recommendation: { ...ok.recommendation, defaultLimit: 20 } }).success).toBe(false);
    expect(ServiceConfigSchema.safeParse({ ...ok, restrictedMechanicsByMarket: { GB: ["teleport"] } }).success).toBe(false);
  });
});

describe("eval/release-gates.json", () => {
  const gates = JSON.parse(readFileSync(join(REPO_ROOT, "eval", "release-gates.json"), "utf8")) as Record<string, unknown>;

  it("groups the spec 02 §7 gates by layer, each with a rule and a why", () => {
    expect(typeof gates._comment).toBe("string");
    const layers = Object.fromEntries(Object.entries(gates).filter(([k]) => k !== "_comment")) as Record<string, Record<string, { min?: number; max?: number; why?: string }>>;
    expect(Object.keys(layers.information!)).toEqual(expect.arrayContaining(["protectedFieldViolations", "regulatedFieldsInvented", "crypticRecordFabrications"]));
    expect(layers.eligibility).toMatchObject({ eligibilityViolations: { max: 0 }, duplicateViolations: { max: 0 } });
    expect(layers.policy).toMatchObject({ policyViolations: { max: 0 } });
    expect(layers.abstention).toMatchObject({ expectedDeclineRate: { min: 0.8 }, coverage: { min: 0.8 } });
    for (const group of Object.values(layers)) {
      for (const gate of Object.values(group)) {
        expect((gate.min === undefined) !== (gate.max === undefined)).toBe(true);
        expect(gate.why?.length).toBeGreaterThan(10);
      }
    }
  });
});
