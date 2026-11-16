# Spec 06: ranking evaluation, the runner and the report

> **How to use this spec.** `Read @AGENTS.md and implement @docs/prompts/06-ranking-evaluation.md`.
> It builds on specs 01–05. The layer gates, ground-truth eligibility and policy checks and the trap table are in [spec 02, section 7](02-guardrail-layers-and-compliance-traps.md). The per-cluster metrics are in [spec 03, section 7](03-benchmark-clusters-and-evaluation-dimensions.md). This spec covers enrichment quality, ranking quality, the runner and the report.
> Where this spec and `AGENTS.md` disagree, `AGENTS.md` wins. Flag the conflict rather than guessing.

## 1. Goal

A **repeatable, free** evaluation that answers whether the AI output is good enough to ship. It reads only the artefacts from specs 01 and 05, and makes **no model calls**.

It's separate from the software tests: test coverage is not an AI evaluation.

## 2. Deliverables

| Path | What |
| --- | --- |
| `eval/relevance.ts` | `relevance(a, b)`, `dcg`, `ndcgAtK` (section 3) |
| `eval/release-gates.json` | Gates as data, each with a `why` (section 6) |
| `eval/run-eval.ts` | `npm run eval` (report) and `npm run eval:gate` (exit 1 on any failure). Both take `--provider=offline` |
| `eval/reports/latest.md`, `latest.json` | The report (section 7) for the OpenAI build, committed. An offline run writes `eval/reports/offline/latest.md` and `latest.json`, git-ignored |
| `docs/EVALUATION.md` | The evaluation design in prose, including known limitations. First version here; spec 08 §4 completes it |

**Inputs**, from the build being evaluated (spec 05 §3): the OpenAI build by default, the offline one with `--provider=offline`:
- `catalogue.canonical.json`, `eval-reference.json` and `catalogue.raw.json` from its data folder;
- `enriched-catalogue.json`, `index.json` and `eval-variants.json` from its artefact folder;
- `config/service.json`.

If a file is missing, exit 1 with a message naming it and the command that builds it. Never fall back to the other build. If the `indexVersion` in the variants file doesn't match the index, fail ("rebuild the index").

## 3. Silver relevance labels (`eval/relevance.ts`)

These are graded labels computed from the **clean** canonical records. The system only ever saw the messy feed, so they ask: "despite the bad data, did we recover what a curator would call related?"

**Generic mechanics** (ignored for overlap): `free_spins`, `fixed_paylines`, `multipliers`.

| Grade | Rule, checked in this order |
| --- | --- |
| 3 | Same non-null `seriesId` |
| 2 | Same game type, at least 1 shared theme, and (at least 1 shared distinctive mechanic, or same volatility) |
| 2 | Same game type and same non-null jackpot network |
| 1 | Same game type and (at least 1 shared theme, or at least 2 shared distinctive mechanics, or the type isn't slot) |
| 1 | Both table/live family and at least 1 shared theme |
| 0 | Otherwise |

- `dcg(grades) = Σ (2^g − 1) / log2(i + 2)`.
- `ndcgAtK(returned, idealPool, k) = dcg(returned[:k]) / dcg(sorted(idealPool)[:k])`, which is 0 when the ideal is 0.

Document plainly that these are **silver** labels: a rule standing in for a curator. They're good for comparing variants and catching regressions, but not a substitute for a human-labelled golden set before launch.

## 4. Enrichment quality (layer 1 metrics)

For each enriched record, compare against the rules-only normalisation of its raw record ("source") and against its canonical record ("truth"). Opaque records are judged only on whether they stayed empty.

**Gated** (see section 6), with exact counting units:
- **Protected-field violations:** for every enriched record and each authoritative field (the same list as spec 04 §6.1: title, provider, aggregator, rtp, maxStake, minStake, maxWin, jackpotNetwork, reelLayout, releaseYear, status, isTestGame, seasonMonths, brands, markets), +1 if it differs (JSON-equal) from the rules-only normalisation.
- **Regulated fields invented:** +1 per field among rtp, maxStake, minStake and maxWin that is null in the source and non-null in the output.
- **Off-vocabulary tags in output:** themes and mechanics in the enriched output that aren't in the vocabulary.
- **Injection leaks:** +1 per prompt-injection record whose summary fails the guard's summary lint or matches `/guarantee|free money|risk.free|every player/i`.
- **Opaque-record fabrications:** +1 per opaque record where any of game type, themes, mechanics or volatility has provenance `llm` or `rules`.
- *Game-type accuracy when filled:* on records whose source had no game type but the output has one.
- *Theme precision when filled:* on records with no source themes; micro-averaged (filled themes in the truth ÷ all filled themes).
- **The unit for both** is the feed record (duplicates and RTP variants count separately). Opaque records are excluded, because they're judged only on staying empty. Title-only records are included whenever the output has a fill. If a rebuild of the reference data doesn't give 0.667 for theme precision, recompute it without title-only records, and record which choice matches in `REBUILD_NOTES.md`.

**Reported only:**
- fill rates; theme recall; mechanic precision and recall when filled;
- volatility accuracy when inferred, and how many were inferred;
- title-only tag precision, and how many title-only tags were inferred;
- tags rejected by the guard; LLM fallbacks; routing counts (`routed_<method>`).

Also list a **sample of wrong fills** (wrong game type; filled themes with no overlap with the truth).

## 5. Ranking quality

### 5.1 Queries

- Every game whose **index** record (`ServiceGame`) is active and not a test build, on every **enabled** brand that carries it. These are the service's own flags, so the queries are the ones the service would really be asked.
- Use the first market in the brand's config list that the game is licensed in: one market per brand.
- Month 7 (July).

### 5.2 Per-variant metrics (k = 5)

Run `recommend()` with the real config for each neighbour variant:
- `enriched` (shipped), `raw_text`, `rules_enriched` (if present);
- `random`: a seeded shuffle with every score 1 and threshold 0;
- `oracle (ceiling)`: neighbours ordered by grade, grade-0 games dropped, scores `0.9 + grade/100`, threshold 0.

Metrics:
**Averaging:**
- nDCG@5 is the mean over **answered** queries (macro).
- Precision@5 and the bad-recommendation rate are pooled over every item shown (micro).

**The ideal pool** for a query is every game, one entry per feed record, that:
- isn't a record of the seed's canonical game;
- isn't flagged `insufficient` (the service's own flag, since that's a data-quality fact, not a label);
- passes ground-truth eligibility in the query's context;
- passes the ground-truth policy against the seed.

Diversity caps are ignored. The grade of a returned record of the seed's own game would be 0, but the service never returns one (dedupe). Because the pool counts feed records, a game with a duplicate export or RTP variant appears twice in it, while the service can return it only once. The same goes for different games sharing a displayed name (spec 02 §6.2, `quality:duplicate_title`). That lowers nDCG slightly. It's kept as defined, and `EVALUATION.md` lists it under known limitations.

**Baselines:**
- `random`: for each seed, every other game in a seeded order (seed 2024, the whole catalogue, not a top 40), all with score 1.
- `oracle`: every other record (excluding only the seed record itself) with grade ≥ 1, sorted by grade. Records of the seed's own canonical game are removed later by the service's dedupe.
- The exact baseline code (draw order of the random shuffle included) is in [appendix A14](appendix-reference-values.md#a14-evaluation-baselines).
- Ranking queries use `limit = 5`; the exhaustive safety check uses `maxLimit` (spec 02 §7).

**Metrics:**
- **Seeds that should abstain** (title-only or opaque) count only towards the **expected-decline rate**.
- For the rest:
  - **nDCG@5:** returned grades vs an ideal pool of every game the seed could legitimately get. Legitimate means not the same canonical game, not insufficient, eligible by **ground truth**, and passing the policy by ground truth.
  - **Precision@5:** share of shown items with grade ≥ 1.
  - **Bad-recommendation rate:** share with grade 0.
  - **Coverage (answerable):** share answered among the queries the oracle answers. Where three genuinely related, eligible games don't exist, declining is correct. 1 − coverage = false abstention.
  - **All-query coverage:** share answered among all non-abstaining queries.
  - Decline reasons, counted.

### 5.3 Threshold sweep

For the shipped variant, vary the embedder's `minScore` over a grid of 13 steps from base − 0.25 to base + 0.35 (step 0.05, positive only), recording nDCG@5, bad-rec rate and answerable coverage. Compute each point as `round(base + k × 0.05, 2)` for k = −5…7, rather than by repeated addition, and drop values ≤ 0.

Print the suggested operating point: the lowest bad-rec rate with coverage at or above the coverage gate, ties broken by higher nDCG@5. Print nothing if that's the current threshold. The threshold is the operating point and may be tuned; **gates may not**.

### 5.4 Failure cases

- The 4 lowest-nDCG seeds (unique), with each returned item, its grade and the truth (type; themes; mechanics; volatility).
- Up to 4 queries where an unrelated (grade-0) game holds the top slot.

## 6. Release gates (`eval/release-gates.json`)

A `_comment` explains that thresholds are product decisions, set before looking at results, and changed only in review. Gates are grouped by layer, each `{ min | max, why }`. The information, eligibility, policy and abstention gates are in spec 02, section 7. This spec adds:

| Group | Gate | Rule |
| --- | --- | --- |
| information | `offVocabularyTagsInOutput` | max 0 |
| information | `injectionLeaks` | max 0 |
| information | `gameTypeAccuracyWhenFilled` | min 0.9 |
| information | `themePrecisionWhenFilled` | min 0.7 |
| ranking | `ndcgAt5` | min 0.6 |
| ranking | `ndcgLiftOverRawText` (enriched − raw_text) | min 0.0 |
| ranking | `badRecommendationRate` | max 0.15 |

A gate with no value (n/a) **fails**.

## 7. The report (`eval/reports/latest.md`, or `eval/reports/offline/latest.md` for an offline run; same data in `latest.json`)

Sections, in this order:

1. **Header:**
   - index version, build time, enrichment model and prompt, embedder, record and game counts, query count;
   - for an offline build, a callout saying the keyless stand-in isn't the shipped configuration and that ranking-gate failures are expected.
2. **Release gates: PASS/FAIL**, as a table: layer, gate, value, rule, result.
3. **Planted traps** (spec 02, section 7).
4. **Benchmark clusters** (spec 03, section 7).
5. **Layer 1: information integrity:** the metrics table and the wrong-fills sample.
6. **Layers 2 and 3:**
   - the violation counts and the first 10 violations;
   - a table of candidates removed per rule (from diagnostics) across all queries, showing the rules are doing work.
7. **Layer 4 and ranking quality:**
   - the variants table (nDCG@5, P@5, bad-rec rate, coverage, all-query coverage, expected-decline rate);
   - decline reasons; the threshold sweep; failure cases.

**Console output:**
- the gate table;
- the cluster macro line;
- "Planted traps: X/Y handled correctly", listing misses;
- the threshold suggestion;
- the report path.

## 8. Constraints

- No model calls; deterministic for a given set of artefacts.
- The runner may read evaluation labels. **Nothing else** may (spec 05 boundary test).

## 9. Acceptance criteria

1. `npm run eval -- --provider=offline` on an offline build writes both report files to `eval/reports/offline/`, shows the offline callout, and runs in seconds. `npm run eval` with no OpenAI build present exits 1 with a clear message.
2. On the offline build, every information, eligibility, policy and abstention gate passes except theme precision (0.667 on the reference data; game-type accuracy happens to be 1.0 there, but neither quality gate is meaningful offline, see spec 01 §6.4). Ranking gates may fail, and the report says why that's expected.
3. **The oracle row** has bad-rec rate 0 and precision@5 of 1. **The random row** is clearly worse than `enriched`.
4. `npm run eval:gate` exits 1 when any gate fails, and 0 otherwise. The gate logic should be a pure function, tested on a passing and a failing set of values, because no offline build passes every gate end to end.
5. `docs/EVALUATION.md` covers:
   - what "good" means per stage;
   - the reference data;
   - every metric and gate;
   - that the labels are silver;
   - the shared origin of labels and catalogue (this measures recovery from bad data, not player agreement);
   - the need for a curator golden set and an online A/B test with safer-gambling guardrails;
   - the label revision (non-slot types and table/live pairings, made after the oracle showed the first labels were too strict, and before any LLM build was evaluated). This happened during spec development, on the prototype. Document the labels as specified and note that history; don't present the revision as something that happened in this repo.

## Decisions

| Point | Decision | Why |
| --- | --- | --- |
| LLM-as-judge for relevance | **No:** deterministic silver labels from the clean catalogue, plus clearly labelled limits | Repeatable and free; the golden set comes later |
| Coverage over all queries | **No:** over answerable queries, with an oracle ceiling | Declining is right when no good rail exists; otherwise the gate punishes correct behaviour |
| Labels revised once | **Disclosed** | The oracle showed the first version scored every non-slot pairing as unrelated |
| Tune gates to pass | **Never** | The threshold is the operating point; gates are the release decision |
| Baselines | random, raw text, rules-enriched and an oracle ceiling | Shows both the floor and what's achievable, so a gate failure can be attributed |
| Which build is evaluated | **The committed OpenAI build by default;** offline only on request, into a git-ignored report folder; a missing build exits 1 | An offline report in `eval/reports/` could be read, or committed, as the shipped result |
| Query set | **The index's own active and test flags** | The evaluation should ask what the service would be asked |
| Denominators for the enrichment-quality gates | **Feed records, opaque records excluded** | Opaque records have their own fabrication gate. Left open, the gate value depends on the rebuild |
