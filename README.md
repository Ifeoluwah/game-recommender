# Related-games recommender

A "Because you played X, you might like…" rail for a regulated, real-money casino product. All AI work runs at build time; the service only loads a precomputed artefact and applies rules. The full README (architecture, how to run it, the API) is written with [spec 08](docs/prompts/08-production-architecture-and-docs.md); until then, see [`START_HERE.md`](START_HERE.md) and [`AGENTS.md`](AGENTS.md).

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
