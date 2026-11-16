# Threshold analysis: why the OpenAI build fails `badRecommendationRate`

**Build:** the OpenAI build, index `ef13f1ecf784` (`gpt-4o-mini` enrichment with `enrich-game.v2`, `text-embedding-3-small`), and its report `eval/reports/latest.json`. Analysed 2026-11-16.

**How it was done:** read-only. Nothing in the repo was changed and no model was called. Scratch scripts imported the repo's own `recommend()`, `relevance()`, `rankingQueries()`, `oracleNeighbours()` and `evaluate()`, and read the committed artefacts. As a check, `evaluate()` on those artefacts reproduces `latest.json` byte for byte. So every number below uses the evaluator's exact definitions: July, k = 5, the real config, silver labels, and coverage against the oracle. The simulations change one input (the threshold, or a pre-filtered neighbour list) and re-run the same code.

**Where the gate stands:** 14 of 15 gates pass. `badRecommendationRate` is **0.531** against a maximum of 0.15. nDCG@5 is 0.632 (gate ≥ 0.6), lift over raw text +0.008, coverage 1.0. The sweep suggests minScore 0.65, which gives bad-rec 0.266 and still fails.

## Summary

- **The bad items aren't mostly ranking errors. They come from rails that shouldn't exist.** Of the 381 grade-0 items shown, **297 (78%)** are in the 75 answered queries where **even the oracle declines**: no three related, eligible games exist for that seed in that context. Across the 70 queries the oracle *can* answer, the shipped rail's bad-rec rate is 84 / 350 = **0.24**.
- **69% of bad items are same-type slots with no shared theme** (263 of 381). That's exactly the pairing the silver labels grade 0. The rest (118) are a different game type.
- **The four failure seeds have nothing better to offer.** For g-003 and g-004, no other game in the catalogue shares their theme. For g-014 and g-016-cms2, the theme-mates rank at the very top of the neighbour list, and eligibility correctly removes every one. The oracle declines all four. The service fills the rail with similar-looking filler instead.
- **The threshold barely acts at 0.45.** For 72 of the 88 seeds, every one of the top 40 neighbours scores at or above 0.45, so the loop never reaches the threshold. That's why the sweep is flat from 0.2 to 0.45.
- **No threshold on the sweep grid passes both gates.** Between grid points, 0.69 passes both, with coverage exactly 0.800. That's a knife edge.
- **A "share at least one theme" rule would pass both gates** at 0.45–0.55 (bad-rec 0.135–0.137, coverage 0.81–0.84), but it halves the answered queries. It also builds the silver label's own definition into the service (see the options).

## 1. Grade-0 items that share the seed's game type but no theme

Over the **145 answered queries** (non-abstaining seeds, `enriched`, as in the report), **381 items are grade 0**:

| Kind of grade-0 item | Items | Share of bad items |
| --- | --- | --- |
| Same game type as the seed, no shared theme | **263** | **69.0%** |
| Different game type | 118 | 31.0% |
| Same game type with a shared theme | 0 | 0% (impossible: the labels give that grade ≥ 1) |

- All 263 are slot → slot pairs. For non-slot types, the labels give same type grade 1 whatever the theme.
- They're spread out: **86 of the 145 answered queries** contain at least one.
- The comparison uses the **canonical** (true) types and themes, as the labels do.

## 2. The four lowest-nDCG seeds

The report's four failure seeds (nDCG@5 0, every item grade 0). The fourth is **g-016-cms2**, the duplicate export of g-016, not g-016 itself. The original g-016 isn't among the four.

"Relevant" below means grade ≥ 1, not the seed's own game, not insufficient, and eligible and within policy **by ground truth** in the query's context: the evaluator's ideal pool. Scores are from the seed's enriched neighbour list (top 40). The threshold is 0.45.

| Seed | Context | Truth | Oracle | Theme-mates in the catalogue | Where they sit |
| --- | --- | --- | --- | --- | --- |
| g-003 "Nightmare's Embrace" | harbour/GB | slot; horror; sticky wilds, cascading reels; high | **declines** (`NO_CONFIDENT_MATCHES`) | **none**: it's the only horror game | n/a |
| g-004 "Champions Arena" | harbour/GB | slot; sports; multipliers, free spins; medium | **declines** | **none**: it's the only sports game | n/a |
| g-014 "Festive Revelry" | aurora/GB | slot; festive; multipliers, cascading reels; medium | **declines** | 8 (5 slots, 2 bingo, 1 scratch card) | **Ranks 1–8 of its list.** Every one is out of season in July, and some are also withdrawn or a test build |
| g-016-cms2 "THUNDER HALLS: VALKYRIE'S CALL" | aurora/GB | slot; nordic; expanding wilds, free spins; high | **declines** | 1: g-035 "Thunder Halls: Odin's Fury" (same series, grade 3) | **Rank 2** (0.8216), behind g-016 itself at rank 1 (0.973, its own game, deduped). g-035 is withdrawn, not on aurora and not licensed in GB |

g-014's festive neighbours in detail, all removed by eligibility in July:

| Rank | Game | Score | Grade | Removed by |
| --- | --- | --- | --- | --- |
| 1 | g-106 "Festive Revelry Classic" (its certification-expired copy) | 0.9386 | 2 | `not_live`, `out_of_season` |
| 2 | g-073 "Jolly Winterfest Spins" | 0.7680 | 1 | `out_of_season` |
| 3 | g-108 "TEST_JOLLY_WINTERFEST_SPINS_V2" | 0.7653 | 1 | `test_game`, `out_of_season` |
| 4 | g-105 "Jolly Winterfest Spins Deluxe" | 0.7452 | 1 | `not_live`, `out_of_season` |
| 5 | g-010 "Festive Bingo Bonanza" | 0.6861 | 0 | `not_live`, `out_of_season`, `feature_restricted_in_market` |
| 6 | g-078 "Deep Reef Adventure" | 0.6755 | 2 | `out_of_season` |
| 7 | g-057 "Festive Scratch Extravaganza" | 0.6702 | 0 | `out_of_season` |
| 8 | g-015 "Festive Bingo Gala" | 0.6632 | 0 | `out_of_season` |

What the service served instead, all grade 0 and all scoring well above the threshold:

| Seed | Served (score) |
| --- | --- |
| g-003 | g-096 (0.62), g-068 (0.60), g-016 (0.58), g-051 (0.57), g-083 (0.55) |
| g-004 | g-099 (0.60), g-031 (0.58), g-084 (0.56), g-030 (0.55), g-022 (0.54) |
| g-014 | g-024 (0.64), g-036 (0.63), g-101 (0.63), g-068 (0.62), g-052 (0.62) |
| g-016-cms2 | g-051 (0.64), g-096 (0.60), g-099 (0.58), g-070 (0.57), g-083 (0.56) |

**Answer:** in none of the four is a relevant game present but outranked. In g-003 and g-004, no relevant game exists. In g-014 and g-016-cms2, the relevant games rank highest and the rules correctly remove them: the similarity ranking did its job. The failure is in **layer 4**: the rail answers with five unrelated slots where the right answer is a decline. nDCG@5 is 0 for these by definition, because the ideal pool's grades are all 0.

## 3. Games per theme

Canonical games (108) carrying each theme of a non-abstaining seed. A game counts once per theme it carries.

| Theme | Games | Slots | | Theme | Games | Slots |
| --- | --- | --- | --- | --- | --- | --- |
| asian | 3 | 3 | | horror | **1** | 1 |
| candy | **1** | 1 | | irish | 3 | 3 |
| cards | 6 | 0 | | music | 3 | 2 |
| classic | 12 | 11 | | mythology | 4 | 4 |
| egyptian | 13 | 12 | | nordic | **2** | 2 |
| fantasy | 5 | 5 | | pirates | **2** | 2 |
| festive | 9 | 6 | | roulette | 7 | 0 |
| fishing | 7 | 5 | | space | 5 | 5 |
| fruit | 13 | 11 | | sports | **1** | 1 |
| game_show | 7 | 0 | | underwater | 7 | 7 |
| gems | 3 | 2 | | wealth | 5 | 4 |
| | | | | western | 3 | 3 |

**Themes with fewer than 3 games: candy (1), horror (1), sports (1), nordic (2), pirates (2).** All five are a primary theme somewhere. A slot seed whose only theme is one of these can never get a grade ≥ 1 slot unless it's in a series, shares a jackpot network, or shares two distinctive mechanics. Several themes at exactly 3 (asian, gems, irish, music, western) are one ineligible game away from the same problem.

## 4. Simulation: a "share at least one theme" rule

Simulated by filtering each seed's neighbour list to candidates that share a theme with it, then running the real `recommend()` and the evaluator. This gives the same result as a quality rule inside the loop, because a rejected candidate never touches the caps. Two theme sources:
- **enriched themes**, which is what a real rule could use (the enriched catalogue's themes: source plus guarded fills);
- **true themes**, an upper bound that can't be implemented, showing what perfect theme enrichment would give.

Coverage is against the unchanged oracle. There are 169 non-abstaining queries. 13 of them always decline as `INSUFFICIENT_SOURCE_DATA`, so 156 can be answered at all. "Declined" is the `NO_CONFIDENT_MATCHES` count. Gates: bad-rec ≤ 0.15, coverage ≥ 0.8, nDCG@5 ≥ 0.6.

| minScore | Rule | Bad-rec rate | Coverage | nDCG@5 | Answered | Declined |
| --- | --- | --- | --- | --- | --- | --- |
| 0.45 | none (shipped) | 0.531 | 1.000 | 0.632 | 145 | 11 |
| 0.50 | none | 0.523 | 1.000 | 0.633 | 140 | 16 |
| 0.55 | none | 0.505 | 1.000 | 0.631 | 136 | 20 |
| 0.60 | none | 0.416 | 0.986 | 0.688 | 117 | 39 |
| 0.65 | none | 0.266 | 0.900 | 0.788 | 82 | 74 |
| **0.45** | **enriched themes** | **0.137** | **0.843** | **0.725** | 67 | 89 |
| 0.50 | enriched themes | 0.137 | 0.843 | 0.725 | 67 | 89 |
| 0.55 | enriched themes | 0.135 | 0.814 | 0.734 | 64 | 92 |
| 0.60 | enriched themes | 0.096 | *0.729* | 0.763 | 56 | 100 |
| 0.65 | enriched themes | 0.050 | *0.600* | 0.807 | 42 | 114 |
| 0.45 | true themes (bound) | 0.129 | 0.971 | 0.786 | 76 | 80 |
| 0.50 | true themes (bound) | 0.129 | 0.971 | 0.786 | 76 | 80 |
| 0.55 | true themes (bound) | 0.123 | 0.971 | 0.785 | 75 | 81 |
| 0.60 | true themes (bound) | 0.078 | 0.900 | 0.790 | 68 | 88 |
| 0.65 | true themes (bound) | 0.038 | 0.786 | 0.820 | 55 | 101 |

- With enriched themes, the rule passes all three gates at 0.45–0.55. Coverage falls below the gate from 0.60.
- The gap between enriched and true themes (coverage 0.843 vs 0.971) is theme enrichment's misses. **The rule would turn every missed theme into a decline.**
- Threshold alone, between grid points (same method, no rule):

| minScore | Bad-rec rate | Coverage | nDCG@5 | Answered |
| --- | --- | --- | --- | --- |
| 0.66 | 0.268 | 0.843 | 0.790 | 77 |
| 0.67 | 0.218 | 0.829 | 0.796 | 69 |
| 0.68 | 0.182 | 0.814 | 0.805 | 66 |
| **0.69** | **0.094** | **0.800** | 0.807 | 60 |
| 0.70 | 0.028 | 0.700 | 0.811 | 49 |

## 5. Simulation: more than 40 neighbours

The index stores only each game's top 40, with no vectors, so lists can't be extended without re-embedding, which is a model call. Cosine is symmetric, though, so a pair outside A's top 40 has a known score when it's inside B's.

**For the four failure seeds: no, a larger K would surface no theme-mate.**
- g-003 and g-004 have no theme-mate in the catalogue at any rank.
- g-014's 8 theme-mates are already its ranks 1–8.
- g-016-cms2's single theme-mate is already rank 2.

All four are blocked by the catalogue or by eligibility, not by the cut-off. A larger K would only bring in more candidates scoring between the threshold and their 40th score (0.498, 0.527, 0.563 and 0.533), which is more filler of the same kind.

**Across all seeds, the cut-off does matter, but not for these four:**
- 72 of the 88 non-abstaining seeds have a 40th neighbour scoring at least 0.45, so their lists are cut off above the threshold.
- Of 703 (seed, theme-mate) pairs, 83 fall outside the seed's top 40. The score can be recovered for 59 of them, and 40 of those score at least 0.45.
- So a larger K would let the loop reach some theme-mates after the rules remove the top of the list. Without a theme rule, it would equally let it reach more same-type filler.

## Options

None of these is implemented. Each needs its own spec change and evaluation (AGENTS.md rule 8), and a different index version.

| # | Option | What it does here | For | Against |
| --- | --- | --- | --- | --- |
| A | **Raise minScore to about 0.69** (the operating point, which may be tuned) | Bad-rec 0.094, coverage 0.800, nDCG@5 0.807; answers 60 of 169 queries | Config-only; no code, schema or ADR change; gates untouched | Coverage is *exactly* the gate. It's fitted to 184 queries on a 108-game catalogue, and OpenAI embeddings shift slightly between rebuilds (known limitation), so a rebuild could flip it. Off the sweep's own grid (the suggestion is 0.65, which fails). Answers about a third of queries. A near-copy at 0.68 is lost along with the filler |
| B | **Quality rule: share at least one (enriched) theme with the seed**, threshold unchanged | Bad-rec 0.137, coverage 0.843, nDCG@5 0.725; answers 67 | Targets the dominant failure (same-type, no theme: 69% of bad items). Stable across thresholds 0.45–0.55, not a knife edge. Fits "decline over pad" (AGENTS.md rule 7) | **It builds the silver label's definition into the service**, so the bad-rec gain is partly the metric agreeing with itself (Goodhart). A curator might well rate a dark cascading slot as related to a horror one. Needs themes in `ServiceGame` (index schema v3), a spec 02 §6.2 change and an ADR row. Theme-enrichment misses become declines (0.843 vs 0.971 with perfect themes). Halves the answered queries |
| C | **B plus a modest threshold** (e.g. 0.55) | Bad-rec 0.135, coverage 0.814 | Slightly cleaner rails | Coverage is close to the gate again, for almost no bad-rec gain over B |
| D | **Decline seeds with too little catalogue support** (e.g. fewer than 3 eligible theme-mates or series-mates) | Would decline the 4 failure seeds; aims at the 297 bad items in queries the oracle declines (not simulated) | Aimed squarely at the layer-4 failure the analysis finds. Explainable as "not enough related games" | Effectively B by another route, with the same Goodhart and schema concerns. Its exact effect isn't simulated here |
| E | **Raise K above 40** | Nothing for the four failure seeds | Lets the loop reach 40 known theme-mate pairs above 0.45 that sit beyond rank 40 | On its own it adds as much filler as signal; it helps only together with B or D. Bigger index; rebuild needs embeddings again (a model call) |
| F | **Grow the catalogue's thin themes** (candy, horror, sports, nordic, pirates) | Gives singleton-theme seeds real theme-mates | Partly a synthetic-data artefact: a production catalogue has far more games per theme | Changes the dataset, labels and `catalogueHash`. Fixes the test, not the system's behaviour when a real seed is genuinely unique |
| G | **Accept the failing gate: don't ship this index as is** | No change; `eval:gate` stays red | The gate is the release decision and was set before results. The evidence (bad items concentrated where no good answer exists) belongs in the PR, and the golden set is the right place to settle whether same-type, other-theme slots are bad | No release. "Accepting" can't mean shipping anyway: tuning or waiving a gate after seeing results is exactly what `release-gates.json` forbids. Any waiver is a reviewed, recorded product and compliance decision |
| H | **Redefine the metric** (e.g. bad-rec only over oracle-answerable queries: 0.24) | Still fails (0.24 > 0.15) | Separates ranking quality from abstention quality | Changing a definition after seeing results needs the same disclosure as the label revision. It doesn't pass anyway, so it only reframes the problem |

**Reading the evidence:** the failure is mostly **abstention**. The rail answers where nothing related exists, because at 0.45 the threshold never fires for most seeds. It's less a matter of the embedder ranking unrelated games above related ones. That points at B or D over A: A buys the pass by declining broadly at a fragile operating point. But B and D lower bad-rec partly by construction, because they encode the label rule. So their gain should be confirmed on a curator golden set before it's trusted. Until then, G (don't ship, with this note in the PR) is the decision the gates as written already make.
