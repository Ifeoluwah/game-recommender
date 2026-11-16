import { beforeAll, describe, expect, it } from "vitest";
import { HashingEmbedder } from "../src/ai/providers.js";
import { buildIndex, neighboursFor, rawEmbeddingText } from "../src/pipeline/build-index.js";
import { enrichCatalogue } from "../src/pipeline/enrich.js";
import { normaliseRecord } from "../src/pipeline/normalise.js";
import { loadServiceConfig } from "../src/service/service-config.js";
import { jsonFileText, sha256 } from "../src/util/misc.js";
import { evaluate, sweepThresholds, suggestOperatingPoint, withThemeRuleOff } from "../eval/evaluate.js";
import type { EvalInputs, EvalReport } from "../eval/evaluate.js";
import { loadGates } from "../eval/gates.js";
import { noRailsLine, renderMarkdown, trapLine } from "../eval/report.js";
import { offlineDataset } from "./helpers/offline-dataset.js";

/**
 * The evaluation on the full offline build, built in memory (tests never read build outputs,
 * spec 05 §9). Checks the properties spec 06 §9 and the deferred spec 02 AC4 / spec 03 AC5 ask of it.
 * The numbers themselves are the evaluation's business, not a test's, except where a spec fixes them.
 */

let inputs: EvalInputs;
let report: EvalReport;

beforeAll(async () => {
  const d = await offlineDataset();
  const normalised = d.raw.map((r) => normaliseRecord(r));
  const { games: enriched } = await enrichCatalogue(normalised);
  const embedder = new HashingEmbedder();
  const index = await buildIndex(enriched, embedder, {
    catalogueHash: sha256(jsonFileText(d.raw)).slice(0, 16),
    enrichment: { method: "rules", model: null, promptVersion: "rules.v1" },
    now: () => new Date("2026-11-16T00:00:00Z"),
  });
  const rawText = await neighboursFor(normalised.map((g) => g.id), normalised.map(rawEmbeddingText), embedder);
  inputs = {
    mode: "offline", canonical: d.canonical, reference: d.reference, raw: d.raw, enriched, index,
    variants: { enriched: index.neighbours, raw_text: rawText }, config: loadServiceConfig(), gates: loadGates(),
  };
  report = evaluate(inputs);
}, 120_000);

const gate = (key: string) => report.gates.rows.find((r) => r.gate === key)!;

describe("the offline evaluation (spec 06 §9)", () => {
  it("is the reference offline build", () => {
    expect(report.header.catalogueHash).toBe("5caf2bbb0f343546");
    expect(report.header).toMatchObject({ feedRecords: 113, canonicalGames: 108, mode: "offline" });
  });

  it("every planted trap is handled except one known false abstention: 39 rows (spec 02 AC4)", () => {
    expect(report.traps.total).toBe(39);
    // quality:no_shared_theme declines g-003, the only horror game offline, although the silver labels
    // grade 5 eligible slots as related to it (mechanics, not theme). A real cost of the rule, pinned
    // here so any new miss fails this test (docs/EVALUATION.md, "The theme-overlap rule").
    expect(report.traps.rows.filter((r) => !r.ok)).toEqual([{
      layer: "4 Abstention", trap: "Cold-start release (should answer)", record: "g-003 \"Crypt Legends\"",
      // The row attributes the decline: without the theme rule the seed answers.
      happened: expect.stringMatching(/^harbour\/GB: declined NO_CONFIDENT_MATCHES; 5 related eligible games by ground truth; without quality:no_shared_theme: ok, \d+ items \(no_shared_theme removed \d+\)$/),
      ok: false,
    }]);
    expect(trapLine(report)).toBe("Planted traps: 38/39 handled correctly. Misses: Cold-start release (should answer): g-003 \"Crypt Legends\"");
    const count = (trap: string) => report.traps.rows.filter((r) => r.trap === trap).length;
    expect([count("Title only"), count("Opaque record"), count("Seasonal title"), count("Duplicate export")]).toEqual([5, 3, 4, 3]);
  });

  it("every information, eligibility, policy and abstention gate passes except theme precision (AC2)", () => {
    for (const key of ["protectedFieldViolations", "regulatedFieldsInvented", "crypticRecordFabrications", "offVocabularyTagsInOutput", "injectionLeaks", "eligibilityViolations", "duplicateViolations", "policyViolations"]) {
      expect(gate(key)).toMatchObject({ value: 0, result: "PASS" });
    }
    expect(gate("gameTypeAccuracyWhenFilled")).toMatchObject({ value: 1, result: "PASS" });
    expect(gate("themePrecisionWhenFilled")).toMatchObject({ value: 0.667, result: "FAIL" });
    expect(gate("expectedDeclineRate").result).toBe("PASS");
    expect(gate("coverage").result).toBe("PASS");
  });

  it("ranking gates fail offline, so the release decision fails (AC2, AC4)", () => {
    // nDCG@5 passes offline since quality:no_shared_theme (AC2 allows any ranking gate to pass or fail);
    // lift over raw text and the bad-rec rate still fail.
    expect(gate("ndcgLiftOverRawText").result).toBe("FAIL");
    expect(gate("badRecommendationRate").result).toBe("FAIL");
    expect(report.gates.passed).toBe(false);
  });

  it("the oracle row has bad-rec rate 0 and precision@5 1; random is clearly worse than enriched (AC3)", () => {
    const row = (v: string) => report.ranking.variants.find((x) => x.variant === v)!;
    expect(row("oracle (ceiling)")).toMatchObject({ badRecommendationRate: 0, precisionAt5: 1, coverage: 1 });
    expect(row("random").ndcgAt5!).toBeLessThan(row("enriched").ndcgAt5! - 0.2);
    expect(row("random").badRecommendationRate!).toBeGreaterThan(row("enriched").badRecommendationRate!);
    expect(report.ranking.variants.map((v) => v.variant)).toEqual(["enriched", "raw_text", "random", "oracle (ceiling)"]);
  });

  it("reports the clusters raw → enriched with a macro row (spec 03 AC5), at the kept expected values", () => {
    expect(report.clusters.variants).toEqual(["raw_text", "enriched"]);
    expect(report.clusters.rows.map((r) => [r.cluster, r.members, r.nearMisses])).toEqual(expect.arrayContaining([["egyptian_cascade", 5, 2], ["live_game_show", 5, 2]]));
    // On the neighbour lists, before any rule: unchanged from the prototype (REBUILD_NOTES "kept").
    expect(report.clusters.macro.raw_text).toMatchObject({ recallAt5: 0.825, mrr: 1, nearMissIntrusion: 0.15 });
    expect(report.clusters.macro.enriched).toMatchObject({ recallAt5: 0.8, mrr: 1, nearMissIntrusion: 0 });
    const md = renderMarkdown(report);
    expect(md).toContain("## Benchmark clusters");
    expect(md).toMatch(/\*\*macro\*\* \|  \| 0\.825 → 0\.8 \|/);
  });

  it("renders the sections in spec 06 §7 order, with the offline callout", () => {
    const md = renderMarkdown(report);
    const order = ["## Release gates", "## Planted traps", "## Benchmark clusters", "## Layer 1", "## Layers 2 and 3", "## Layer 4 and ranking quality", "### Threshold sweep", "### Failure cases"];
    const at = order.map((h) => md.indexOf(h));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(md).toContain("not the shipped configuration");
    expect(md).toContain("ranking-gate failures are expected");
  });

  it("is deterministic for a given set of artefacts", () => {
    expect(jsonFileText(evaluate(inputs))).toBe(jsonFileText(report));
  });

  it("reports coverage per brand and market, and names a context where every rail declines (spec 06 §5.2)", () => {
    const pc = report.ranking.perContext;
    const nonAbstaining = report.header.rankingQueries - report.ranking.abstainingQueries;
    expect(pc.reduce((n, c) => n + c.queries, 0)).toBe(nonAbstaining);
    expect(pc.reduce((n, c) => n + c.answered, 0)).toBe(report.ranking.variants.find((v) => v.variant === "enriched")!.answered);
    // Known since the theme rule, on both builds: liberty/NJ has no rails. Pinned so a change is noticed.
    const nj = pc.find((c) => c.brand === "liberty" && c.market === "NJ")!;
    expect(nj.answered).toBe(0);
    expect(nj.themesBelowMinResults).toBeGreaterThan(0);
    expect(report.ranking.contextsWithNoRails).toEqual(["liberty/NJ"]);
    expect(noRailsLine(report)).toContain("liberty/NJ");
    const md = renderMarkdown(report);
    expect(md).toContain("### Coverage per brand and market");
    expect(md).toContain("**Every rail declines in: liberty/NJ.**");
  });

  it("reports coverage against an oracle the theme rule doesn't constrain, which answers at least as much", () => {
    const free = report.ranking.oracleWithoutThemeRule;
    expect(free.answerable).toBeGreaterThanOrEqual(report.ranking.answerableQueries);
    expect(free.coverage).not.toBeNull();
    expect(renderMarkdown(report)).toContain("against an oracle without `quality:no_shared_theme` (not gated)");
  });

  it("withThemeRuleOff gives every game the same themes and changes nothing else", () => {
    const games = withThemeRuleOff(inputs.index.games);
    const themeSets = new Set(Object.values(games).map((g) => g.themes.join(",")));
    expect(themeSets.size).toBe(1);
    for (const [id, g] of Object.entries(games)) expect({ ...g, themes: [] }).toEqual({ ...inputs.index.games[id]!, themes: [] });
  });

  it("counts the rules' work across the exhaustive check", () => {
    // 113 games × (4 + 4 + 1 + 1 brand-markets) × 2 months.
    expect(report.rules.exhaustiveCalls).toBe(113 * 10 * 2);
    expect(report.rules.outcomes.BRAND_DISABLED).toBe(113 * 2);
    for (const rule of ["eligibility:not_licensed_in_market", "eligibility:feature_restricted_in_market", "eligibility:out_of_season", "policy:volatility_escalation", "quality:duplicate_or_rtp_variant"]) {
      expect(report.rules.removedPerRule[rule]).toBeGreaterThan(0);
    }
  });
});

describe("threshold sweep (spec 06 §5.3)", () => {
  it("13 points from base − 0.25 to base + 0.35, computed by multiplication, positive only", () => {
    expect(sweepThresholds(0.45)).toEqual([0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8]);
    expect(sweepThresholds(0.3)).toEqual([0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65]);
    expect(sweepThresholds(0.2)).toEqual([0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55]); // 0 and below dropped
  });

  it("suggests the lowest bad-rec rate that keeps coverage at the gate, ties broken by nDCG", () => {
    const p = (threshold: number, badRecommendationRate: number, coverage: number, ndcgAt5: number) => ({ threshold, badRecommendationRate, coverage, ndcgAt5 });
    const points = [p(0.3, 0.2, 0.95, 0.7), p(0.4, 0.1, 0.85, 0.6), p(0.45, 0.1, 0.82, 0.65), p(0.5, 0.05, 0.7, 0.8)];
    expect(suggestOperatingPoint(points, 0.8)?.threshold).toBe(0.45);
    expect(suggestOperatingPoint(points, 0.99)).toBeNull();
  });
});
