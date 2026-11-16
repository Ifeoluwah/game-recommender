# Evaluation report

| Field | Value |
| --- | --- |
| Index version | ef13f1ecf784 |
| Index built | 2026-11-16T02:51:37.789Z |
| Catalogue hash | 5c6ce9c495e70325 |
| Enrichment | llm, model openai:gpt-4o-mini, prompt enrich-game.v2 |
| Embedder | openai:text-embedding-3-small (1536 dimensions) |
| Feed records / canonical games | 113 / 108 |
| Ranking queries | 184 (15 should abstain, 70 answerable by the oracle) |
| Variants | enriched, raw_text, rules_enriched |

Silver labels: relevance is a rule over the clean catalogue standing in for a curator (see `docs/EVALUATION.md`). Good for comparing variants and catching regressions; not a substitute for a human-labelled golden set.

## Release gates: FAIL

| Layer | Gate | Value | Rule | Result |
| --- | --- | --- | --- | --- |
| information | `protectedFieldViolations` | 0 | ≤ 0 | PASS |
| information | `regulatedFieldsInvented` | 0 | ≤ 0 | PASS |
| information | `crypticRecordFabrications` | 0 | ≤ 0 | PASS |
| information | `offVocabularyTagsInOutput` | 0 | ≤ 0 | PASS |
| information | `injectionLeaks` | 0 | ≤ 0 | PASS |
| information | `gameTypeAccuracyWhenFilled` | 1 | ≥ 0.9 | PASS |
| information | `themePrecisionWhenFilled` | 0.85 | ≥ 0.7 | PASS |
| eligibility | `eligibilityViolations` | 0 | ≤ 0 | PASS |
| eligibility | `duplicateViolations` | 0 | ≤ 0 | PASS |
| policy | `policyViolations` | 0 | ≤ 0 | PASS |
| abstention | `expectedDeclineRate` | 1 | ≥ 0.8 | PASS |
| abstention | `coverage` | 1 | ≥ 0.8 | PASS |
| ranking | `ndcgAt5` | 0.632 | ≥ 0.6 | PASS |
| ranking | `ndcgLiftOverRawText` | 0.008 | ≥ 0 | PASS |
| ranking | `badRecommendationRate` | 0.531 | ≤ 0.15 | **FAIL** |

## Planted traps: 40/40 handled correctly

One row per planted record and trap (spec 02 §7). Served counts come from the exhaustive check; anchor rows use the market-first context, with the trap's similarity rank in its anchor's neighbour list.

| Layer | Trap | Record | What happened | ok |
| --- | --- | --- | --- | --- |
| Ranking | RTP variant | g-002-rtp94 "Pharaoh's Secret Treasures (94.1%)" | key "pharaohssecrettreasures\|bramblegames" = g-002's | ok |
| 1 Information + 4 Abstention | Opaque record | g-006 "GAME_4380_V1" | nothing inferred; insufficient true; RTP null | ok |
| 2 Eligibility | Seasonal title | g-010 "Festive Bingo Bonanza" | served 0 in July (December: 0, not judged) | ok |
| 1 Information + 4 Abstention | Title only | g-011 "Gilded Dragon: Legacy of the East" | RTP null, max win null; insufficient true | ok |
| 4 Abstention | Cold-start release (should answer) | g-013 "Pharaoh's Secrets" | liberty/NJ: ok, 5 items | ok |
| 2 Eligibility | Seasonal title | g-014 "Festive Revelry" | served 0 in July (December: 197, not judged) | ok |
| 2 Eligibility | Seasonal title | g-015 "Festive Bingo Gala" | served 0 in July (December: 0, not judged) | ok |
| Ranking | Duplicate export | g-016-cms2 "THUNDER HALLS: VALKYRIE'S CALL" | key "thunderhallsvalkyriescall\|redwatergaming" = g-016's | ok |
| Ranking | Studio/aggregator swapped | g-016-cms2 "THUNDER HALLS: VALKYRIE'S CALL" | studio Redwater Gaming (truth Redwater Gaming); key matches g-016 | ok |
| 1 Information | Misleading title | g-019 "Fruit Blast Scratch" | type instant_win (llm); truth instant_win | ok |
| 1 Information + 4 Abstention | Title only | g-020 "Sphinx's Gold" | RTP null, max win null; insufficient true | ok |
| Ranking | Duplicate export | g-023-cms2 "CLASSIC JACKPOT SPIN" | key "classicjackpotspin\|northlightinteractive" = g-023's | ok |
| 2 Eligibility | Licence data missing | g-041 "Royal Card Showdown" | served 0 (Jul) + 0 (Dec) | ok |
| 1 Information + 4 Abstention | Opaque record | g-045 "GAME_3821_V1" | nothing inferred; insufficient true; RTP null | ok |
| 1 Information + 4 Abstention | Title only | g-046 "Enchanted Realms" | RTP null, max win null; insufficient true | ok |
| 2 Eligibility | Licence data missing | g-049 "Mystic Quest: Dragon's Lair" | served 0 (Jul) + 0 (Dec) | ok |
| 4 Abstention | Cold-start release (should answer) | g-050 "Roulette Royale" | aurora/GB: ok, 5 items | ok |
| 1 Information | Prompt injection | g-051 "Mythic Realms" | summary "Mythic Realms is a 5x4 slot featuring mythology themes with …" | ok |
| Ranking | Duplicate export | g-055-cms2 "ROYAL FLUSH SHOWDOWN" | key "royalflushshowdown\|redwatergaming" = g-055's | ok |
| 1 Information | Misleading title | g-057 "Festive Scratch Extravaganza" | type instant_win (llm); truth instant_win | ok |
| Ranking | RTP variant | g-059-rtp93 "Lucky Clover Lane 93" | key "luckycloverlane\|northlightinteractive" = g-059's | ok |
| 1 Information + 4 Abstention | Opaque record | g-063 "GAME_7487_V1" | nothing inferred; insufficient true; RTP null | ok |
| 1 Information | Prompt injection | g-064 "Fruit Fiesta Scratch" | summary "This instant win game features a 3x3 scratch grid with fruit…" | ok |
| 1 Information | Marketing fluff | g-071 "Mystic Realms" | no invented mechanic; volatility null (missing) | ok |
| 2 Eligibility | Seasonal title | g-073 "Jolly Winterfest Spins" | served 0 in July (December: 215, not judged) | ok |
| 2 Eligibility | Status missing | g-074 "Outlaw's Bounty" | served 0 (Jul) + 0 (Dec) | ok |
| 1 Information + 4 Abstention | Title only | g-077 "Galactic Quest" | RTP null, max win null; insufficient true | ok |
| 2 Eligibility | Seasonal title | g-078 "Deep Reef Adventure" | served 0 in July (December: 128, not judged) | ok |
| 1 Information | Marketing fluff | g-092 "Gilded Dragon: Fortune Awaits" | no invented mechanic; volatility null (missing) | ok |
| 1 Information + 4 Abstention | Title only | g-094 "Jungle Prowl" | RTP null, max win null; insufficient true | ok |
| 2 Eligibility | Market twin (not licensed in NJ) | g-101 "Fortune's Bounty II" | absent on g-036's rail, liberty/NJ (7 shown); similarity rank #1; rules: not_licensed_in_market | ok |
| 2 Eligibility | Market twin (not licensed in NJ) | g-102 "Stellar Quest II" | absent on g-084's rail, liberty/NJ (6 shown); similarity rank #1; rules: not_licensed_in_market | ok |
| 2 Eligibility | Bonus buy in GB | g-103 "Enchanted Realms Xtreme" | absent on g-096's rail, aurora/GB (declined NO_CONFIDENT_MATCHES); similarity rank #1; rules: feature_restricted_in_market | ok |
| 3 Policy | Volatility/stake escalation | g-103 "Enchanted Realms Xtreme" | absent on g-096's rail, aurora/ES (declined NO_CONFIDENT_MATCHES); similarity rank #1; rules: volatility_escalation, stake_escalation, min_bet_escalation | ok |
| 2 Eligibility | Bonus buy in GB | g-104 "Classic Reels: Retro Spin Xtreme" | absent on g-098's rail, aurora/GB (declined NO_CONFIDENT_MATCHES); similarity rank #1; rules: feature_restricted_in_market | ok |
| 3 Policy | Volatility/stake escalation | g-104 "Classic Reels: Retro Spin Xtreme" | absent on g-098's rail, aurora/ES (declined NO_CONFIDENT_MATCHES); similarity rank #1; rules: volatility_escalation, stake_escalation, min_bet_escalation | ok |
| 2 Eligibility | Status suspended | g-105 "Jolly Winterfest Spins Deluxe" | served 0 (Jul) + 0 (Dec) | ok |
| 2 Eligibility | Status certification_expired | g-106 "Festive Revelry Classic" | served 0 (Jul) + 0 (Dec) | ok |
| 2 Eligibility | Status demo_only | g-107 "Gemstone Quest Demo" | served 0 (Jul) + 0 (Dec) | ok |
| 2 Eligibility | Test build with live status | g-108 "TEST_JOLLY_WINTERFEST_SPINS_V2" | served 0 (Jul) + 0 (Dec) | ok |

## Benchmark clusters

Similarity metrics are on the neighbour lists before any rule; served Recall@5 is on what `recommend()` returns (limit 5, July, market-first context). Shown as raw_text → enriched. Reported, not gated, until a curator has reviewed the cluster design (spec 03 §7).

| Cluster | Members / near-misses | Recall@5 | MRR | Near-miss intrusion | Served Recall@5 |
| --- | --- | --- | --- | --- | --- |
| `live_game_show` | 5 / 2 | 1 → 1 | 0.9 → 0.9 | 0.8 → 1 | 0.6 → 0.6 |
| `egyptian_cascade` | 5 / 2 | 0.9 → 0.75 | 1 → 0.84 | 0 → 0.4 | 0.8 → 0.8 |
| `fishing_cash_collect` | 5 / 2 | 1 → 0.95 | 1 → 1 | 0 → 0 | 0.8 → 0.8 |
| `classic_fruit` | 5 / 2 | 0.9 → 0.9 | 1 → 0.9 | 0.2 → 0.2 | 0.8 → 0.8 |
| **macro** |  | 0.95 → 0.9 | 0.975 → 0.91 | 0.25 → 0.4 | 0.75 → 0.75 |

Served recall below similarity recall is expected: partial cluster records often lose their volatility, the policy treats an unknown-volatility seed as low, and that blocks its high-volatility fellow members. That's the fail-closed rule working, not a ranking failure (spec 03 §7).

## Layer 1: information integrity

Unit: feed records, opaque excluded (110 records). Opaque records are judged only on staying empty (`crypticRecordFabrications`).

| Metric | Value | Gated |
| --- | --- | --- |
| Protected-field violations | 0 | yes |
| Regulated fields invented | 0 | yes |
| Opaque-record fabrications | 0 | yes |
| Off-vocabulary tags in output | 0 | yes |
| Injection leaks | 0 | yes |
| Game-type accuracy when filled (17 filled) | 1 | yes |
| Theme precision when filled (20 tags) | 0.85 | yes |
| Fill rate: gameType (source → output) | 0.736 → 0.891 | no |
| Fill rate: themes (source → output) | 0.655 → 0.827 | no |
| Fill rate: mechanics (source → output) | 0.582 → 0.727 | no |
| Fill rate: volatility (source → output) | 0.618 → 0.636 | no |
| Theme recall (of themes the source lacked) | 0.395 | no |
| Mechanic precision when filled (26 tags) | 0.769 | no |
| Mechanic recall (of mechanics the source lacked) | 0.294 | no |
| Volatility accuracy when inferred (2 inferred) | 1 | no |
| Title-only tag precision (0 tags) | n/a | no |
| Tags rejected by the guard | 0 | no |
| LLM fallbacks | 0 | no |
| routed_llm | 62 | no |
| routed_skipped_complete | 51 | no |

### Wrong fills (2)

Wrong game types, and filled themes with no overlap with the truth:

| Record | Title | Field | Filled | Truth | Method |
| --- | --- | --- | --- | --- | --- |
| g-035 | Thunder Halls: Odin's Fury | themes | mythology | nordic | llm |
| g-074 | Outlaw's Bounty | themes | adventure | western | llm |

## Layers 2 and 3: eligibility and policy, against ground truth

Every game × every configured brand (disabled included) × every market it serves, in July and December, at limit 12: 2260 calls. Each returned item is checked against the canonical record, not the service's own view of it.

| Check | Violations |
| --- | --- |
| Eligibility | 0 |
| Duplicate | 0 |
| Policy | 0 |

No violations.

Outcomes: BRAND_DISABLED 226, INSUFFICIENT_SOURCE_DATA 222, NO_CONFIDENT_MATCHES 98, ok 1312, SEED_NOT_AVAILABLE 402.

### Candidates removed per rule

Summed over the exhaustive check's diagnostics, showing the rules are doing work.

| Rule | Removed |
| --- | --- |
| `diversity:provider_cap` | 1597 |
| `eligibility:feature_restricted_in_market` | 509 |
| `eligibility:not_licensed_in_market` | 7511 |
| `eligibility:not_live` | 4920 |
| `eligibility:not_on_brand` | 10445 |
| `eligibility:out_of_season` | 2732 |
| `eligibility:test_game` | 723 |
| `policy:min_bet_escalation` | 164 |
| `policy:stake_escalation` | 2787 |
| `policy:stake_unknown` | 80 |
| `policy:volatility_escalation` | 2974 |
| `policy:volatility_unknown` | 6310 |
| `quality:duplicate_or_rtp_variant` | 598 |
| `quality:duplicate_title` | 270 |
| `quality:thin_record` | 59 |

## Layer 4 and ranking quality

k = 5, July. nDCG@5 is the mean over answered queries; precision@5 and the bad-recommendation rate are pooled over every item shown. Coverage is over the 70 queries the oracle answers; all-query coverage over every query that shouldn't abstain. The expected-decline rate is over the 15 title-only and opaque seeds. Score threshold for openai:text-embedding-3-small: 0.45.

| Variant | nDCG@5 | P@5 | Bad-rec rate | Coverage | All-query coverage | Expected-decline rate | Answered | Items |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `enriched` | 0.632 | 0.469 | 0.531 | 1 | 0.858 | 1 | 145 | 718 |
| `raw_text` | 0.624 | 0.49 | 0.51 | 1 | 0.834 | 1 | 141 | 688 |
| `rules_enriched` | 0.63 | 0.474 | 0.526 | 1 | 0.858 | 1 | 145 | 717 |
| `random` | 0.123 | 0.106 | 0.894 | 1 | 0.899 | 1 | 152 | 754 |
| `oracle (ceiling)` | 0.928 | 1 | 0 | 1 | 0.414 | 1 | 70 | 313 |

### Decline reasons

| Variant | `INSUFFICIENT_SOURCE_DATA` | `NO_CONFIDENT_MATCHES` |
| --- | --- | --- |
| `enriched` | 28 | 11 |
| `raw_text` | 28 | 15 |
| `rules_enriched` | 28 | 11 |
| `random` | 28 | 4 |
| `oracle (ceiling)` | 28 | 86 |

### Threshold sweep (`enriched`)

| minScore | nDCG@5 | Bad-rec rate | Coverage |
| --- | --- | --- | --- |
| 0.2 | 0.627 | 0.539 | 1 |
| 0.25 | 0.627 | 0.539 | 1 |
| 0.3 | 0.627 | 0.539 | 1 |
| 0.35 | 0.627 | 0.539 | 1 |
| 0.4 | 0.627 | 0.536 | 1 |
| **0.45** (current) | 0.632 | 0.531 | 1 |
| 0.5 | 0.633 | 0.523 | 1 |
| 0.55 | 0.631 | 0.505 | 1 |
| 0.6 | 0.688 | 0.416 | 0.986 |
| 0.65 | 0.788 | 0.266 | 0.9 |
| 0.7 | 0.811 | 0.028 | 0.7 |
| 0.75 | 0.772 | 0.015 | 0.6 |
| 0.8 | 0.748 | 0 | 0.343 |

Suggested operating point for openai:text-embedding-3-small: minScore 0.65 (bad-rec 0.266, coverage 0.9, nDCG@5 0.788); current 0.45.

The threshold is the operating point and may be tuned; the gates may not.

### Failure cases

The 4 lowest-nDCG seeds (`enriched`). Truth is type; themes; mechanics; volatility.

**g-003 "Nightmare's Embrace"** on harbour/GB, nDCG@5 0. Truth: slot; horror; sticky_wilds, cascading_reels; high.

| # | Item | Score | Grade | Truth |
| --- | --- | --- | --- | --- |
| 1 | g-096 "Enchanted Realms" | 0.6216 | 0 | slot; fantasy; multipliers, free_spins; low |
| 2 | g-068 "Cascading Sands" | 0.5952 | 0 | slot; egyptian; cascading_reels, multipliers; high |
| 3 | g-016 "Thunder Halls: Valkyrie's Call" | 0.5783 | 0 | slot; nordic; expanding_wilds, free_spins; high |
| 4 | g-051 "Mythic Realms" | 0.5733 | 0 | slot; mythology; free_spins, multipliers; medium |
| 5 | g-083 "Cascading Pharaohs" | 0.5493 | 0 | slot; egyptian; cascading_reels, multipliers; high |

**g-004 "Champions Arena"** on harbour/GB, nDCG@5 0. Truth: slot; sports; multipliers, free_spins; medium.

| # | Item | Score | Grade | Truth |
| --- | --- | --- | --- | --- |
| 1 | g-099 "Gemstone Quest" | 0.6019 | 0 | slot; gems; multipliers, free_spins; medium |
| 2 | g-031 "Gods of Olympus" | 0.579 | 0 | slot; mythology; free_spins, multipliers; medium |
| 3 | g-084 "Stellar Quest" | 0.5604 | 0 | slot; space; free_spins; medium |
| 4 | g-030 "Bandit Ridge Showdown" | 0.5516 | 0 | slot; western; free_spins, multipliers; medium |
| 5 | g-022 "Reel Catch Adventure" | 0.5447 | 0 | slot; fishing, underwater; cash_collect, free_spins; medium |

**g-014 "Festive Revelry"** on aurora/GB, nDCG@5 0. Truth: slot; festive; multipliers, cascading_reels; medium.

| # | Item | Score | Grade | Truth |
| --- | --- | --- | --- | --- |
| 1 | g-024 "Fruit Fiesta" | 0.6357 | 0 | slot; fruit, classic; fixed_paylines; low |
| 2 | g-036 "Fortune's Bounty" | 0.6332 | 0 | slot; wealth; multipliers, free_spins; medium |
| 3 | g-101 "Fortune's Bounty II" | 0.626 | 0 | slot; wealth; multipliers, free_spins; medium |
| 4 | g-068 "Cascading Sands" | 0.6225 | 0 | slot; egyptian; cascading_reels, multipliers; high |
| 5 | g-052 "Treasure of the Seven Seas" | 0.616 | 0 | slot; pirates; cascading_reels, pick_bonus; high |

**g-016-cms2 "THUNDER HALLS: VALKYRIE'S CALL"** on aurora/GB, nDCG@5 0. Truth: slot; nordic; expanding_wilds, free_spins; high.

| # | Item | Score | Grade | Truth |
| --- | --- | --- | --- | --- |
| 1 | g-051 "Mythic Realms" | 0.6435 | 0 | slot; mythology; free_spins, multipliers; medium |
| 2 | g-096 "Enchanted Realms" | 0.6012 | 0 | slot; fantasy; multipliers, free_spins; low |
| 3 | g-099 "Gemstone Quest" | 0.5794 | 0 | slot; gems; multipliers, free_spins; medium |
| 4 | g-070 "Pharaoh's Cascade" | 0.5699 | 0 | slot; egyptian; cascading_reels, multipliers; high |
| 5 | g-083 "Cascading Pharaohs" | 0.5649 | 0 | slot; egyptian; cascading_reels, multipliers; high |

Queries where an unrelated (grade-0) game holds the top slot:

- g-003 "Nightmare's Embrace" (slot; horror; sticky_wilds, cascading_reels; high) on harbour/GB: #1 is g-096 "Enchanted Realms" (slot; fantasy; multipliers, free_spins; low), score 0.6216.
- g-004 "Champions Arena" (slot; sports; multipliers, free_spins; medium) on harbour/GB: #1 is g-099 "Gemstone Quest" (slot; gems; multipliers, free_spins; medium), score 0.6019.
- g-014 "Festive Revelry" (slot; festive; multipliers, cascading_reels; medium) on aurora/GB: #1 is g-024 "Fruit Fiesta" (slot; fruit, classic; fixed_paylines; low), score 0.6357.
- g-016 "Thunder Halls: Valkyrie's Call" (slot; nordic; expanding_wilds, free_spins; high) on aurora/GB: #1 is g-051 "Mythic Realms" (slot; mythology; free_spins, multipliers; medium), score 0.647.
