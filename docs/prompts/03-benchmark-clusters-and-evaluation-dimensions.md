# Spec 03: benchmark clusters and evaluation dimensions

> **How to use this spec.** `Read @AGENTS.md and implement @docs/prompts/03-benchmark-clusters-and-evaluation-dimensions.md`.
> It builds on [spec 01](01-dataset-spec.md) and [spec 02](02-guardrail-layers-and-compliance-traps.md). With all three implemented, the full dataset is reproduced.
> Where this spec and `AGENTS.md` disagree, `AGENTS.md` wins. Flag the conflict rather than guessing.

## 1. Goal

Make ranking quality **diagnosable**: measure *which kinds* of similarity the representation understands, and whether it understands more than the theme word. A single overall score can look fine while one kind of game is badly served.

## 2. Deliverables

| Path | What |
| --- | --- |
| `src/domain/vocabulary.ts` | Check that theme `fishing` and mechanic `cash_collect` and their synonyms are there. They're already in spec 01's vocabulary (appendix A2), listed here because these clusters need them |
| `src/catalogue/slate.ts` | `BENCHMARK_CLUSTERS` and cluster entries in `buildSlate` (section 3) |
| `src/catalogue/creative.ts` | `enforceSlate()` applied to LLM and offline output (section 4) |
| `src/catalogue/degrade.ts` | Cluster availability and profiles; `labelsFor()` (sections 5–6) |
| `src/domain/types.ts` | `benchmarkCluster`, `clusterRole` on the canonical schema |
| `scripts/generate-catalogue.ts` | `evaluation_dimensions` in `manifest.json` (section 6) |
| `eval/run-eval.ts` | Per-cluster metrics section (section 7) |
| `README.md` | "Dataset design" section (section 8) |
| `tests/pipeline.test.ts` | Section 9 |

## 3. The clusters

Four clusters, planted inside the otherwise seeded-random catalogue. Each has **5 members** that should recommend each other and **2 near-misses**: same theme, different game type or mechanics, which should rank *below* the members.

| Cluster id | Theme | Members (5) | Near-miss 1 | Near-miss 2 |
| --- | --- | --- | --- | --- |
| `egyptian_cascade` | egyptian | slot; `cascading_reels`, `multipliers`; high | instant win; `scratch_card`; low | slot; `fixed_paylines`; low; also `classic` |
| `fishing_cash_collect` | fishing | slot; `cash_collect`, `free_spins`; alternating medium/high; also `underwater` | instant win; `scratch_card`; low | bingo; `pick_bonus`; low |
| `classic_fruit` | fruit | slot; `fixed_paylines`; low; also `classic` | slot; `megaways`, `cascading_reels`; high | slot; `megaways`, `bonus_buy`; extreme |
| `live_game_show` | game_show | live; `wheel_bonus`, `multipliers`, `live_dealer`; medium | live; `live_dealer`; low; also `roulette` | live; `live_dealer`, `side_bets`; low; also `cards` |

**Slate integration.** These 28 entries take slate slots.
- Each carries `cluster`, `clusterRole` (`member` / `near_miss`) and `forced: { mechanics, volatility, extraThemes }`.
- The remaining fixed non-slot counts shrink to compensate: 9 table, 2 live, 5 instant win, 4 bingo.
- The rest are seeded-random slots, so the slate is still 70 slots, 9 table, 9 live, 7 instant win, 5 bingo (spec 01, section 6.1).
- Everything is shuffled with seed 42.

Don't force every theme into a cluster. Four designed clusters inside an organic distribution is more realistic than a fully manufactured catalogue.

## 4. Enforcement after generation (`enforceSlate`)

Cluster attributes are ground truth, so code enforces them; the model is only asked.

- **Prompt.** The slate line for a cluster entry includes `MUST use mechanics=…; volatility=…; also themes=…`. The prompt tells the model to use exactly those and describe the gameplay consistently.
- **After the response,** for every entry with `forced`:
  - `themes = [primary, ...extraThemes]` exactly;
  - `mechanics = forced.mechanics` exactly;
  - `volatility = forced.volatility`;
  - `minStake = £0.20`, `maxStake = £50`, so no stake rule can separate members;
  - `jackpotNetwork = null`;
  - studio assigned round-robin across the 6 studios, counted **separately per cluster and role**. All 5 members get distinct studios, so the per-studio diversity cap (3) can't hide one.
- Apply the same enforcement to the offline generator, which also builds its descriptions from the forced mechanics and volatility.

## 5. Availability and degradation

- **In `assembleCanonical`:** cluster games are `active`, on all three EU brands (plus `liberty` if drawn), and in all EU markets. Recall then depends on similarity alone, not on licensing luck.
- **In `degrade`:**
  - cluster games get profile `rich` (60%) or `partial` (40%). Never thin or title-only: they must still carry signal, but partial records give enrichment real gaps to fill;
  - cluster games are excluded from every edge case and trap pool (spec 01, section 7.3; spec 02, section 4.1).

## 6. Evaluation dimensions (not cohorts)

A record is several things at once: a partial-quality NJ slot in a series can also be a planted trap. So label every record on **independent dimensions** instead of a single cohort field.

`labelsFor(canonical, profile, trapTypes)` adds to every `eval-reference.json` entry:

```ts
labels: {
  gameType,
  qualityProfile,           // rich | partial | thin | title_only
  series,                   // seriesId or null
  semanticCluster,          // cluster id or null
  clusterRole,              // member | near_miss | null
  volatilityBand,           // low | medium | high | extreme
  marketProfile,            // eu_only | eu_and_nj | nj_only | none
  brandScope,               // single_brand | multi_brand
  distribution,             // direct | aggregated
  trapTypes                 // every edge case / trap on this record
}
```

`manifest.json → evaluation_dimensions` summarises them, and **every count names its denominator**:
- `note`: "108 canonical games are represented by 113 feed records; the difference is duplicate exports and RTP variants…";
- `perCanonicalGame`: denominator 108; game type, volatility, series, `benchmarkClusters` (label, members, near-misses), market profile, brand scope, distribution;
- `perFeedRecord`: denominator 113; quality profile, trap types.

## 7. Per-cluster metrics (`eval/run-eval.ts`)

For each cluster, use every **member** as the seed. Work on the **similarity ranking itself** (the precomputed neighbour list, before any rule), excluding records of the seed's own canonical game:

| Metric | Definition |
| --- | --- |
| Recall@5 | other members in the top 5 ÷ min(5, number of other members = 4) |
| MRR | 1 ÷ rank of the first other member (0 if absent from the top 40) |
| Near-miss intrusion | share of seeds where a near-miss ranks above at least one other member. A member missing from the top 40 counts as rank ∞, so any near-miss in the list beats it |
| Served Recall@5 | Recall@5 on what `recommend` actually returns (all guardrails applied), with `limit: 5`, in July. Context: the first enabled brand carrying the seed, in the first of GB, ES, SE, NL where it's licensed. Seeds with no such context are skipped; null if none remain |

Report each for the **raw-text** and **enriched** variants (built by `build-index`), shown as `raw → enriched`, plus a macro average. Print the macro line to the console.

Report these metrics but **don't gate** on them until a curator has reviewed the cluster design.

**Expect served recall below similarity recall.** Partial cluster records lose their volatility 60% of the time. The policy then treats an unknown-volatility seed as low (spec 02 §6.2), which blocks its high-volatility fellow members. That's the fail-closed rule working as designed, and the report should say so. It isn't a ranking failure. `egyptian_cascade` (all high) and `fishing_cash_collect` (medium/high) are the clusters it hits.

The exact cluster definitions are in [appendix A3](appendix-reference-values.md#a3-slate-series-theme-pools-fixed-mix-draw-order).

## 8. README "Dataset design" section

- Open with the 108 games / 113 feed records explanation.
- A dimensions table: dimension, denominator, values.
- A clusters table: id, members, near-misses.
- One sentence on why per-cluster reporting matters.

## 9. Acceptance criteria

All pass with no API key.

1. **`tests/pipeline.test.ts`, clusters:** for each cluster, exactly 5 members and 2 near-misses. Every member has the cluster's theme first, game type, exact mechanics, allowed volatility, status active, £0.20/£50 stakes, and the 5 members have 5 distinct studios. Near-misses share the theme but differ in type or mechanics.
2. **Enforcement on LLM output:** with a fake LLM that returns wrong themes, mechanics and volatility, every forced entry comes back corrected.
3. **Labels:** every reference entry has exactly the 10 label keys. Cluster records are only `rich` or `partial` and carry no traps (seasonal excepted). At least one record has `studio_aggregator_swap`.
4. **`npm run generate -- --provider=offline`:** `manifest.json` shows 4 clusters × (5 + 2), with denominators 108 and 113.
5. **`npm run eval`:** the benchmark-cluster table appears, with raw → enriched values and a macro row.

## Decisions

| Point | Decision | Why |
| --- | --- | --- |
| A single `cohort` field | **Rejected** | A record is several things at once; one label throws information away |
| Force every theme into equal clusters | **Rejected** | Looks manufactured; 4 benchmark clusters planted inside an organic distribution is more realistic |
| Fishing / cash collect | **Added to the vocabulary** | A major real-world slot genre; not expressible with the earlier tags |
| Keep cluster games out of traps and title-only records | **Adopted** | Each cluster should measure similarity, not trap handling; members may still be partial so enrichment has gaps to fill |
| Distinct studios and a common stake range for members | **Adopted** | Otherwise the diversity cap or the stake policy could hide members and distort recall. Found when the first version gave members only 4 distinct studios |
| Gate on cluster metrics | **Not yet** | Report only, until a curator has reviewed the cluster design |
| Measure on the raw similarity ranking | **Adopted**, plus "served" recall after all rules | Separates what the representation understands from what the guardrails remove |
| Offline fishing result (0.95 → 0.4, from the reference draws; a rebuild with other draws will differ) | **Explained, not tuned** | The keyless hashing embedder double-weights volatility words, splitting the mixed medium/high cluster. It's a stand-in limitation; real embeddings are judged on the OpenAI build |
