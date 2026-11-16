import type { ClusterMetrics, EvalReport } from "./evaluate.js";

/** Renders the evaluation report (spec 06 §7) as Markdown, and the console summary. */

const fmt = (x: number | null | undefined): string => (x === null || x === undefined ? "n/a" : String(x));
const cell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const table = (head: string[], rows: Array<Array<string | number | null>>): string =>
  [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map((c) => cell(typeof c === "string" ? c : fmt(c))).join(" | ")} |`)].join("\n");
const arrow = (a: number | null | undefined, b: number | null | undefined) => `${fmt(a)} → ${fmt(b)}`;

export function clusterMacroLine(r: EvalReport): string {
  const [from, to] = [r.clusters.variants[0], r.clusters.variants[r.clusters.variants.length - 1]];
  const m = (v: string | undefined, f: keyof ClusterMetrics) => (v ? r.clusters.macro[v]?.[f] : null);
  return `Clusters (macro, ${from} → ${to}): Recall@5 ${arrow(m(from, "recallAt5"), m(to, "recallAt5"))}, MRR ${arrow(m(from, "mrr"), m(to, "mrr"))}, near-miss intrusion ${arrow(m(from, "nearMissIntrusion"), m(to, "nearMissIntrusion"))}, served Recall@5 ${arrow(m(from, "servedRecallAt5"), m(to, "servedRecallAt5"))}`;
}

export function gateTableText(r: EvalReport): string {
  const rows = r.gates.rows.map((g) => [g.layer, g.gate, fmt(g.value), g.rule, g.result]);
  const widths = [0, 1, 2, 3, 4].map((i) => Math.max(...[["layer", "gate", "value", "rule", "result"][i]!, ...rows.map((row) => row[i]!)].map((s) => s.length)));
  const line = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i]!)).join("  ");
  return [line(["layer", "gate", "value", "rule", "result"]), ...rows.map(line), `Release gates: ${r.gates.passed ? "PASS" : "FAIL"}`].join("\n");
}

export function trapLine(r: EvalReport): string {
  return `Planted traps: ${r.traps.handled}/${r.traps.total} handled correctly${r.traps.misses.length ? `. Misses: ${r.traps.misses.join("; ")}` : ""}`;
}

/** Null when every context answers something; otherwise the warning the runner prints. */
export function noRailsLine(r: EvalReport): string | null {
  return r.ranking.contextsWithNoRails.length ? `Every rail declines in: ${r.ranking.contextsWithNoRails.join(", ")} (see "Coverage per brand and market" in the report)` : null;
}

export function renderMarkdown(r: EvalReport): string {
  const h = r.header;
  const out: string[] = [];
  const offline = h.mode === "offline";

  // 1. Header
  out.push(`# Evaluation report${offline ? " (offline build)" : ""}`, "");
  out.push(
    table(["Field", "Value"], [
      ["Index version", h.indexVersion],
      ["Index built", h.builtAt],
      ["Catalogue hash", h.catalogueHash],
      ["Enrichment", `${h.enrichment.method}, model ${h.enrichment.model ?? "none"}, prompt ${h.enrichment.promptVersion}`],
      ["Embedder", `${h.embedding.id} (${h.embedding.dim} dimensions)`],
      ["Feed records / canonical games", `${h.feedRecords} / ${h.canonicalGames}`],
      ["Ranking queries", `${h.rankingQueries} (${r.ranking.abstainingQueries} should abstain, ${r.ranking.answerableQueries} answerable by the oracle)`],
      ["Variants", h.variants.join(", ")],
    ]),
    "",
  );
  if (offline) {
    out.push(
      "> **Offline build: not the shipped configuration.** This is the keyless stand-in (the rules enricher and the hashing embedder), built so the software and the guardrails can be checked without an API key (spec 01 §6.4). Its ranking-quality numbers say nothing about the model build, and **ranking-gate failures are expected** here. The enrichment-quality gates (theme precision, game-type accuracy) aren't meaningful offline either: the rules enricher is a deliberately simple baseline. The eligibility, policy, information-integrity and abstention gates *are* meaningful, because they test rules that don't depend on the model.",
      "",
    );
  }
  out.push("Silver labels: relevance is a rule over the clean catalogue standing in for a curator (see `docs/EVALUATION.md`). Good for comparing variants and catching regressions; not a substitute for a human-labelled golden set.", "");

  // 2. Gates
  out.push(`## Release gates: ${r.gates.passed ? "PASS" : "FAIL"}`, "");
  out.push(table(["Layer", "Gate", "Value", "Rule", "Result"], r.gates.rows.map((g) => [g.layer, `\`${g.gate}\``, fmt(g.value), g.rule, g.result === "PASS" ? "PASS" : "**FAIL**"])), "");

  // 3. Traps
  out.push(`## Planted traps: ${r.traps.handled}/${r.traps.total} handled correctly`, "");
  out.push("One row per planted record and trap (spec 02 §7). Served counts come from the exhaustive check; anchor rows use the market-first context, with the trap's similarity rank in its anchor's neighbour list.", "");
  out.push(table(["Layer", "Trap", "Record", "What happened", "ok"], r.traps.rows.map((t) => [t.layer, t.trap, t.record, t.happened, t.ok ? "ok" : "**MISS**"])), "");

  // 4. Clusters
  const vs = r.clusters.variants;
  out.push("## Benchmark clusters", "");
  out.push(`Similarity metrics are on the neighbour lists before any rule; served Recall@5 is on what \`recommend()\` returns (limit 5, July, market-first context). Shown as ${vs.join(" → ")}. Reported, not gated, until a curator has reviewed the cluster design (spec 03 §7).`, "");
  const pair = (m: Record<string, ClusterMetrics>, f: keyof ClusterMetrics) => vs.map((v) => fmt(m[v]?.[f])).join(" → ");
  out.push(
    table(["Cluster", "Members / near-misses", "Recall@5", "MRR", "Near-miss intrusion", "Served Recall@5"], [
      ...r.clusters.rows.map((c) => [`\`${c.cluster}\``, `${c.members} / ${c.nearMisses}`, pair(c.byVariant, "recallAt5"), pair(c.byVariant, "mrr"), pair(c.byVariant, "nearMissIntrusion"), pair(c.byVariant, "servedRecallAt5")]),
      ["**macro**", "", pair(r.clusters.macro, "recallAt5"), pair(r.clusters.macro, "mrr"), pair(r.clusters.macro, "nearMissIntrusion"), pair(r.clusters.macro, "servedRecallAt5")],
    ]),
    "",
    "Served recall below similarity recall is expected: partial cluster records often lose their volatility, the policy treats an unknown-volatility seed as low, and that blocks its high-volatility fellow members. That's the fail-closed rule working, not a ranking failure (spec 03 §7).",
    "",
  );

  // 5. Layer 1
  const i = r.information;
  out.push("## Layer 1: information integrity", "");
  out.push(`Unit: ${i.unit}. Opaque records are judged only on staying empty (\`crypticRecordFabrications\`).`, "");
  out.push(
    table(["Metric", "Value", "Gated"], [
      ["Protected-field violations", i.protectedFieldViolations, "yes"],
      ["Regulated fields invented", i.regulatedFieldsInvented, "yes"],
      ["Opaque-record fabrications", i.crypticRecordFabrications, "yes"],
      ["Off-vocabulary tags in output", i.offVocabularyTagsInOutput, "yes"],
      ["Injection leaks", i.injectionLeaks, "yes"],
      [`Game-type accuracy when filled (${i.gameTypeFilled} filled)`, i.gameTypeAccuracyWhenFilled, "yes"],
      [`Theme precision when filled (${i.themeTagsFilled} tags)`, i.themePrecisionWhenFilled, "yes"],
      ...Object.entries(i.fillRates).map(([f, v]) => [`Fill rate: ${f} (source → output)`, arrow(v.source, v.output), "no"]),
      ["Theme recall (of themes the source lacked)", i.themeRecall, "no"],
      [`Mechanic precision when filled (${i.mechanicTagsFilled} tags)`, i.mechanicPrecisionWhenFilled, "no"],
      ["Mechanic recall (of mechanics the source lacked)", i.mechanicRecall, "no"],
      [`Volatility accuracy when inferred (${i.volatilityInferred} inferred)`, i.volatilityAccuracyWhenInferred, "no"],
      [`Title-only tag precision (${i.titleOnlyTagsInferred} tags)`, i.titleOnlyTagPrecision, "no"],
      ["Tags rejected by the guard", i.tagsRejectedByGuard, "no"],
      ["LLM fallbacks", i.llmFallbacks, "no"],
      ...Object.entries(i.routing).map(([k, v]) => [k, v, "no"]),
    ]),
    "",
  );
  if (i.protectedFieldDetails.length) out.push(`First protected-field violations: ${i.protectedFieldDetails.join(", ")}`, "");
  out.push(`### Wrong fills (${i.wrongFills.length})`, "");
  if (i.wrongFills.length === 0) out.push("None.", "");
  else {
    const sample = [...i.wrongFills.filter((f) => f.field === "gameType").slice(0, 8), ...i.wrongFills.filter((f) => f.field === "themes").slice(0, 8)];
    out.push(`Wrong game types, and filled themes with no overlap with the truth${sample.length < i.wrongFills.length ? ` (first 8 of each)` : ""}:`, "");
    out.push(table(["Record", "Title", "Field", "Filled", "Truth", "Method"], sample.map((f) => [f.record, f.title, f.field, f.filled, f.truth, f.method])), "");
  }

  // 6. Layers 2 and 3
  const ru = r.rules;
  out.push("## Layers 2 and 3: eligibility and policy, against ground truth", "");
  out.push(`Every game × every configured brand (disabled included) × every market it serves, in July and December, at limit ${ru.limit}: ${ru.exhaustiveCalls} calls. Each returned item is checked against the canonical record, not the service's own view of it.`, "");
  out.push(table(["Check", "Violations"], [["Eligibility", ru.counts.eligibilityViolations], ["Duplicate", ru.counts.duplicateViolations], ["Policy", ru.counts.policyViolations]]), "");
  out.push(ru.firstViolations.length ? table(["Kind", "Seed", "Context", "Item", "Problems"], ru.firstViolations.map((v) => [v.kind, v.seed, `${v.brand}/${v.market}, month ${v.month}`, v.item, v.problems.join(", ")])) : "No violations.", "");
  out.push(`Outcomes: ${Object.entries(ru.outcomes).map(([k, v]) => `${k} ${v}`).join(", ")}.`, "");
  out.push("### Candidates removed per rule", "", "Summed over the exhaustive check's diagnostics, showing the rules are doing work.", "");
  out.push(table(["Rule", "Removed"], Object.entries(ru.removedPerRule).map(([k, v]) => [`\`${k}\``, v])), "");

  // 7. Layer 4 and ranking
  const rk = r.ranking;
  out.push("## Layer 4 and ranking quality", "");
  out.push(`k = 5, July. nDCG@5 is the mean over answered queries; precision@5 and the bad-recommendation rate are pooled over every item shown. Coverage is over the ${rk.answerableQueries} queries the oracle answers; all-query coverage over every query that shouldn't abstain. The expected-decline rate is over the ${rk.abstainingQueries} title-only and opaque seeds. Score threshold for ${h.embedding.id}: ${rk.threshold}.`, "");
  out.push(
    table(["Variant", "nDCG@5", "P@5", "Bad-rec rate", "Coverage", "All-query coverage", "Expected-decline rate", "Answered", "Items"], rk.variants.map((v) => [`\`${v.variant}\``, v.ndcgAt5, v.precisionAt5, v.badRecommendationRate, v.coverage, v.allQueryCoverage, v.expectedDeclineRate, v.answered, v.itemsShown])),
    "",
  );
  const shipped = rk.variants.find((v) => v.variant === "enriched");
  out.push(
    `Coverage of \`enriched\` against an oracle without \`quality:no_shared_theme\` (not gated): ${fmt(rk.oracleWithoutThemeRule.coverage)}, over the ${rk.oracleWithoutThemeRule.answerable} queries that oracle answers. The gated coverage above is against an oracle that obeys the same rule, so it can't count a decline the rule causes as a false abstention.`,
    "",
  );
  out.push("### Coverage per brand and market (`enriched`)", "");
  out.push(`Not gated. Non-abstaining queries in each context. Eligible games: canonical games live and eligible there by ground truth in July, excluding records flagged insufficient (which are never shown); their distinct themes; and how many of those themes fewer than ${rk.minResults} of the games carry (\`minResults\`), so a seed with only that theme can't fill a rail. ${shipped ? `Overall: ${shipped.answered} answered, all-query coverage ${fmt(shipped.allQueryCoverage)}.` : ""}`, "");
  out.push(
    table(["Brand / market", "Queries", "Answered", "All-query coverage", "Oracle answers", "Coverage", "Declines", "Eligible games", "Themes", `Themes with < ${rk.minResults} games`], rk.perContext.map((c) => [
      `${c.brand}/${c.market}`, c.queries, c.answered === 0 && c.queries > 0 ? "**0 (no rails)**" : String(c.answered), c.allQueryCoverage, c.answerableByOracle, c.coverage,
      Object.entries(c.declineReasons).map(([k, v]) => `${k} ${v}`).join(", ") || "-", c.eligibleGames, c.eligibleThemes, c.themesBelowMinResults,
    ])),
    "",
  );
  if (rk.contextsWithNoRails.length) out.push(`**Every rail declines in: ${rk.contextsWithNoRails.join(", ")}.** Players there never see the rail.`, "");
  out.push("### Decline reasons", "");
  const reasons = [...new Set(rk.variants.flatMap((v) => Object.keys(v.declineReasons)))].sort();
  out.push(table(["Variant", ...reasons.map((x) => `\`${x}\``)], rk.variants.map((v) => [`\`${v.variant}\``, ...reasons.map((x) => v.declineReasons[x] ?? 0)])), "");
  out.push("### Threshold sweep (`enriched`)", "");
  out.push(table(["minScore", "nDCG@5", "Bad-rec rate", "Coverage"], rk.sweep.map((p) => [p.threshold === rk.threshold ? `**${p.threshold}** (current)` : String(p.threshold), p.ndcgAt5, p.badRecommendationRate, p.coverage])), "");
  out.push(rk.suggestion ? rk.suggestion.text : "The current threshold is already the suggested operating point.", "", "The threshold is the operating point and may be tuned; the gates may not.", "");
  out.push("### Failure cases", "", "The 4 lowest-nDCG seeds (`enriched`). Truth is type; themes; mechanics; volatility.", "");
  for (const c of rk.failureCases.lowestNdcg) {
    out.push(`**${c.seed} "${c.title}"** on ${c.context}, nDCG@5 ${fmt(c.ndcg)}. Truth: ${c.seedTruth}.`, "");
    out.push(table(["#", "Item", "Score", "Grade", "Truth"], c.items.map((it, n) => [String(n + 1), `${it.gameId} "${it.title}"`, it.score, it.grade, it.truth])), "");
  }
  out.push("Queries where an unrelated (grade-0) game holds the top slot:", "");
  if (rk.failureCases.topSlotUnrelated.length === 0) out.push("None.", "");
  for (const c of rk.failureCases.topSlotUnrelated) {
    const top = c.items[0]!;
    out.push(`- ${c.seed} "${c.title}" (${c.seedTruth}) on ${c.context}: #1 is ${top.gameId} "${top.title}" (${top.truth}), score ${top.score}.`);
  }
  out.push("");
  return out.join("\n");
}
