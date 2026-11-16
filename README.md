# Related-games recommender

A "Because you played X, you might like…" rail for a regulated, real-money casino product. All AI work runs at build time; the service only loads a precomputed artefact and applies rules. The full README (architecture, how to run it, the API) is written with [spec 08](docs/prompts/08-production-architecture-and-docs.md); until then, see [`START_HERE.md`](START_HERE.md) and [`AGENTS.md`](AGENTS.md).

> **Status** (committed OpenAI build, index `ef13f1ecf784`, [`eval/reports/latest.md`](eval/reports/latest.md)): **not releasable.** 14 of 15 release gates pass; `ndcgLiftOverRawText` fails (−0.003).
>
> - **The service declines 117 of 184 ranking queries** (28 `INSUFFICIENT_SOURCE_DATA`, 89 `NO_CONFIDENT_MATCHES`) and answers 67. A declined rail is hidden.
> - **liberty/NJ returns no rails at all:** 0 of its 25 queries are answered. Only 22 live, eligible games serve NJ, across 13 themes, and 10 of those themes have fewer than 3 games. So no NJ seed finds the three theme-or-series mates a rail needs (`quality:no_shared_theme`, `minResults` 3). `npm run demo` shows this as case 3's expected decline.

## Trade-offs and limitations

Every figure here is from `eval/reports/latest.json`, the committed OpenAI build (index `ef13f1ecf784`), unless marked *offline*.

- **Precision over coverage.** The service answers 67 of 184 ranking queries and declines the rest. All-query coverage is 0.396, over the 169 queries that shouldn't abstain. This is deliberate: on a regulated lobby, a decline the lobby can fall back on beats an unrelated rail under "Because you played X".
- **Why coverage is structurally low here.** There are 108 games across 5 markets and 4 brands (`config/service.json`) and many themes. Many themes have fewer than 3 eligible games: 8 of 17 on aurora/GB, 11 of 21 on harbour/GB and 10 of 13 on liberty/NJ. So the relatedness rule often has nothing to offer. A larger catalogue would be expected to raise coverage, because more themes would have three eligible members. That's an expectation from this mechanism, not a measured result.
- **liberty/NJ returns no rails**, the clearest example: 22 live eligible NJ games across 13 themes. Even the oracle answers none of its 25 queries.
- **Quality when it does answer:**
  - nDCG@5 is 0.725 (gate ≥ 0.6);
  - the bad-rec rate is 0.137 (gate ≤ 0.15);
  - gated coverage is 1.0 (gate ≥ 0.8). That 1.0 is flattering, because the gated oracle obeys the same theme rule, so a decline the rule causes never counts as a false abstention. Against an oracle without the rule, coverage is **0.843** over 70 answerable queries.
- **Lift over raw text is −0.003** (0.725 against 0.728): on this catalogue, enrichment is ranking-neutral at noise level. Its measured value is elsewhere:
  - fill rates, from source to output: game type 0.736 → 0.891, themes 0.655 → 0.827, mechanics 0.582 → 0.727, volatility 0.618 → 0.636, with 0 protected-field violations;
  - forcing thin records to decline: an expected-decline rate of 1 on the 15 title-only and opaque seeds.
- **Where it gets it wrong:**
  - **The four lowest-nDCG seeds.** g-019 "Fruit Blast Scratch", g-061 "Fishing Frenzy Pick Bonus" and g-090 "Catch of the Day Scratch" each score nDCG@5 0, because they are served theme-mates of another game type (a scratch card or bingo game gets fruit or fishing slots). g-008 "Secrets of the Sphinx" scores 0.184, with a scratch card at #3.
  - **g-050 "Roulette Royale"** declines on aurora/GB, although ground truth has 4 related eligible tables. It's this build's one trap miss (39/40). The rule needs a shared theme, but the labels relate same-type tables whatever their theme.
  - **g-003 "Crypt Legends"** (*offline*, `eval/reports/offline/latest.json`): a cold-start decline, the offline build's one miss (38/39 traps). The offline build is a software check, not the shipped system.
  - **Two misleading-title rows prove nothing.** g-019 and g-057 pass vacuously: both titles name their true type ("Scratch"), so they don't test whether enrichment trusts the copy over a misleading title.

## Dataset design

The catalogue is synthetic and fictional, built to look like a real supplier/CMS feed: uneven, inconsistent, partly missing and occasionally hostile ([spec 01](docs/prompts/01-dataset-spec.md)). **108 canonical games are represented by 113 feed records.** The 5 extra records are 3 duplicate exports and 2 RTP variants of existing games, which ingestion must recognise as the same game. Of the 108 games, 100 come from a seeded slate and 8 are guardrail traps derived from real games ([spec 02](docs/prompts/02-guardrail-layers-and-compliance-traps.md)).

A record is several things at once: a partial-quality NJ slot in a series can also be a planted trap. So every record in `eval-reference.json` is labelled on independent dimensions rather than one cohort, and `manifest.json → evaluation_dimensions` counts each against its own denominator.

| Dimension | Denominator | Values |
| --- | --- | --- |
| `gameType` | 108 canonical games | `slot`, `table`, `live`, `instant_win`, `bingo` |
| `volatilityBand` | 108 canonical games | `low`, `medium`, `high`, `extreme` |
| `series` | 108 canonical games | a series id, or none |
| `semanticCluster`, `clusterRole` | 108 canonical games | one of the 4 benchmark clusters below, as `member` or `near_miss`; or none |
| `marketProfile` | 108 canonical games | `eu_only`, `eu_and_nj`, `nj_only`, `none` |
| `brandScope` | 108 canonical games | `single_brand`, `multi_brand` |
| `distribution` | 108 canonical games | `direct`, `aggregated` |
| `qualityProfile` | 113 feed records | `rich`, `partial`, `thin`, `title_only` |
| `trapTypes` | 113 feed records | every planted edge case or trap on the record, e.g. `prompt_injection`, `duplicate_export`, `market_twin`, `escalation_twin`, `test_game`, `seasonal`, `cryptic` |

**Benchmark clusters** ([spec 03](docs/prompts/03-benchmark-clusters-and-evaluation-dimensions.md)). Four designed clusters sit inside an otherwise organic, seeded-random catalogue. Each has 5 members that should recommend each other, and 2 near-misses that share the theme but differ in game type or mechanics, so they should rank below the members.

| Cluster | Members (5) | Near-misses (2) |
| --- | --- | --- |
| `egyptian_cascade` | Egyptian slots; cascading reels, multipliers; high volatility | an Egyptian scratch card (low); an Egyptian classic fixed-payline slot (low) |
| `fishing_cash_collect` | fishing slots, also underwater; cash collect, free spins; medium/high volatility | a fishing scratch card (low); a fishing bingo game with a pick bonus (low) |
| `classic_fruit` | classic fruit slots; fixed paylines; low volatility | a fruit Megaways slot with cascading reels (high); a fruit Megaways slot with bonus buy (extreme) |
| `live_game_show` | live game shows; bonus wheel, multipliers, live dealer; medium volatility | a live roulette game (low); a live card game with side bets (low) |

Cluster members are on every European brand and market, with the same stakes and five different studios, so recall depends on similarity alone, not on licensing, the stake policy or the studio cap.

Per-cluster reporting matters because one overall score can look fine while one kind of game is badly served, and near-misses show whether matching understands more than the theme word.
