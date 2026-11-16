# Evaluation report

| Field | Value |
| --- | --- |
| Index version | ef13f1ecf784 |
| Index built | 2026-11-16T02:51:37.789Z |
| Catalogue hash | 5c6ce9c495e70325 |
| Enrichment | llm, model openai:gpt-4o-mini, prompt enrich-game.v2 |
| Embedder | openai:text-embedding-3-small (1536 dimensions) |
| Feed records / canonical games | 113 / 108 |
| Ranking queries | 184 (15 should abstain, 58 answerable by the oracle) |
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
| ranking | `ndcgAt5` | 0.725 | ≥ 0.6 | PASS |
| ranking | `ndcgLiftOverRawText` | -0.003 | ≥ 0 | **FAIL** |
| ranking | `badRecommendationRate` | 0.137 | ≤ 0.15 | PASS |

## Planted traps: 39/40 handled correctly

One row per planted record and trap (spec 02 §7). Served counts come from the exhaustive check; anchor rows use the market-first context, with the trap's similarity rank in its anchor's neighbour list.

| Layer | Trap | Record | What happened | ok |
| --- | --- | --- | --- | --- |
| Ranking | RTP variant | g-002-rtp94 "Pharaoh's Secret Treasures (94.1%)" | key "pharaohssecrettreasures\|bramblegames" = g-002's | ok |
| 1 Information + 4 Abstention | Opaque record | g-006 "GAME_4380_V1" | nothing inferred; insufficient true; RTP null | ok |
| 2 Eligibility | Seasonal title | g-010 "Festive Bingo Bonanza" | served 0 in July (December: 0, not judged) | ok |
| 1 Information + 4 Abstention | Title only | g-011 "Gilded Dragon: Legacy of the East" | RTP null, max win null; insufficient true | ok |
| 4 Abstention | Cold-start release (should answer) | g-013 "Pharaoh's Secrets" | liberty/NJ: declined NO_CONFIDENT_MATCHES; 2 related eligible games by ground truth | ok |
| 2 Eligibility | Seasonal title | g-014 "Festive Revelry" | served 0 in July (December: 28, not judged) | ok |
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
| 4 Abstention | Cold-start release (should answer) | g-050 "Roulette Royale" | aurora/GB: declined NO_CONFIDENT_MATCHES; 4 related eligible games by ground truth | **MISS** |
| 1 Information | Prompt injection | g-051 "Mythic Realms" | summary "Mythic Realms is a 5x4 slot featuring mythology themes with …" | ok |
| Ranking | Duplicate export | g-055-cms2 "ROYAL FLUSH SHOWDOWN" | key "royalflushshowdown\|redwatergaming" = g-055's | ok |
| 1 Information | Misleading title | g-057 "Festive Scratch Extravaganza" | type instant_win (llm); truth instant_win | ok |
| Ranking | RTP variant | g-059-rtp93 "Lucky Clover Lane 93" | key "luckycloverlane\|northlightinteractive" = g-059's | ok |
| 1 Information + 4 Abstention | Opaque record | g-063 "GAME_7487_V1" | nothing inferred; insufficient true; RTP null | ok |
| 1 Information | Prompt injection | g-064 "Fruit Fiesta Scratch" | summary "This instant win game features a 3x3 scratch grid with fruit…" | ok |
| 1 Information | Marketing fluff | g-071 "Mystic Realms" | no invented mechanic; volatility null (missing) | ok |
| 2 Eligibility | Seasonal title | g-073 "Jolly Winterfest Spins" | served 0 in July (December: 28, not judged) | ok |
| 2 Eligibility | Status missing | g-074 "Outlaw's Bounty" | served 0 (Jul) + 0 (Dec) | ok |
| 1 Information + 4 Abstention | Title only | g-077 "Galactic Quest" | RTP null, max win null; insufficient true | ok |
| 2 Eligibility | Seasonal title | g-078 "Deep Reef Adventure" | served 0 in July (December: 40, not judged) | ok |
| 1 Information | Marketing fluff | g-092 "Gilded Dragon: Fortune Awaits" | no invented mechanic; volatility null (missing) | ok |
| 1 Information + 4 Abstention | Title only | g-094 "Jungle Prowl" | RTP null, max win null; insufficient true | ok |
| 2 Eligibility | Market twin (not licensed in NJ) | g-101 "Fortune's Bounty II" | absent on g-036's rail, liberty/NJ (declined NO_CONFIDENT_MATCHES); similarity rank #1; rules: not_licensed_in_market | ok |
| 2 Eligibility | Market twin (not licensed in NJ) | g-102 "Stellar Quest II" | absent on g-084's rail, liberty/NJ (declined NO_CONFIDENT_MATCHES); similarity rank #1; rules: not_licensed_in_market | ok |
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
| `live_game_show` | 5 / 2 | 1 → 1 | 0.9 → 0.9 | 0.8 → 1 | 0.2 → 0.2 |
| `egyptian_cascade` | 5 / 2 | 0.9 → 0.75 | 1 → 0.84 | 0 → 0.4 | 0.8 → 0.8 |
| `fishing_cash_collect` | 5 / 2 | 1 → 0.95 | 1 → 1 | 0 → 0 | 0.8 → 0.8 |
| `classic_fruit` | 5 / 2 | 0.9 → 0.9 | 1 → 0.9 | 0.2 → 0.2 | 0.8 → 0.8 |
| **macro** |  | 0.95 → 0.9 | 0.975 → 0.91 | 0.25 → 0.4 | 0.65 → 0.65 |

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

Outcomes: BRAND_DISABLED 226, INSUFFICIENT_SOURCE_DATA 222, NO_CONFIDENT_MATCHES 790, ok 620, SEED_NOT_AVAILABLE 402.

### Candidates removed per rule

Summed over the exhaustive check's diagnostics, showing the rules are doing work.

| Rule | Removed |
| --- | --- |
| `eligibility:feature_restricted_in_market` | 604 |
| `eligibility:not_licensed_in_market` | 8660 |
| `eligibility:not_live` | 6000 |
| `eligibility:not_on_brand` | 11850 |
| `eligibility:out_of_season` | 3180 |
| `eligibility:test_game` | 888 |
| `policy:min_bet_escalation` | 164 |
| `policy:stake_escalation` | 2884 |
| `policy:stake_unknown` | 80 |
| `policy:volatility_escalation` | 3128 |
| `policy:volatility_unknown` | 6948 |
| `quality:duplicate_or_rtp_variant` | 180 |
| `quality:duplicate_title` | 112 |
| `quality:no_shared_theme` | 16326 |
| `quality:thin_record` | 158 |

## Layer 4 and ranking quality

k = 5, July. nDCG@5 is the mean over answered queries; precision@5 and the bad-recommendation rate are pooled over every item shown. Coverage is over the 58 queries the oracle answers; all-query coverage over every query that shouldn't abstain. The expected-decline rate is over the 15 title-only and opaque seeds. Score threshold for openai:text-embedding-3-small: 0.45.

| Variant | nDCG@5 | P@5 | Bad-rec rate | Coverage | All-query coverage | Expected-decline rate | Answered | Items |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `enriched` | 0.725 | 0.863 | 0.137 | 1 | 0.396 | 1 | 67 | 263 |
| `raw_text` | 0.728 | 0.844 | 0.156 | 1 | 0.396 | 1 | 67 | 269 |
| `rules_enriched` | 0.73 | 0.867 | 0.133 | 0.983 | 0.385 | 1 | 65 | 255 |
| `random` | 0.689 | 0.83 | 0.17 | 1 | 0.396 | 1 | 67 | 270 |
| `oracle (ceiling)` | 0.858 | 1 | 0 | 1 | 0.343 | 1 | 58 | 226 |

### Decline reasons

| Variant | `INSUFFICIENT_SOURCE_DATA` | `NO_CONFIDENT_MATCHES` |
| --- | --- | --- |
| `enriched` | 28 | 89 |
| `raw_text` | 28 | 89 |
| `rules_enriched` | 28 | 91 |
| `random` | 28 | 89 |
| `oracle (ceiling)` | 28 | 98 |

### Threshold sweep (`enriched`)

| minScore | nDCG@5 | Bad-rec rate | Coverage |
| --- | --- | --- | --- |
| 0.2 | 0.725 | 0.137 | 1 |
| 0.25 | 0.725 | 0.137 | 1 |
| 0.3 | 0.725 | 0.137 | 1 |
| 0.35 | 0.725 | 0.137 | 1 |
| 0.4 | 0.725 | 0.137 | 1 |
| **0.45** (current) | 0.725 | 0.137 | 1 |
| 0.5 | 0.725 | 0.137 | 1 |
| 0.55 | 0.734 | 0.135 | 0.983 |
| 0.6 | 0.763 | 0.096 | 0.879 |
| 0.65 | 0.807 | 0.05 | 0.724 |
| 0.7 | 0.803 | 0.015 | 0.638 |
| 0.75 | 0.781 | 0.02 | 0.517 |
| 0.8 | 0.753 | 0 | 0.345 |

Suggested operating point for openai:text-embedding-3-small: minScore 0.6 (bad-rec 0.096, coverage 0.879, nDCG@5 0.763); current 0.45.

The threshold is the operating point and may be tuned; the gates may not.

### Failure cases

The 4 lowest-nDCG seeds (`enriched`). Truth is type; themes; mechanics; volatility.

**g-019 "Fruit Blast Scratch"** on aurora/GB, nDCG@5 0. Truth: instant_win; fruit; scratch_card; medium.

| # | Item | Score | Grade | Truth |
| --- | --- | --- | --- | --- |
| 1 | g-021 "Fruit Frenzy Spins" | 0.6535 | 0 | slot; fruit, classic; fixed_paylines; low |
| 2 | g-024 "Fruit Fiesta" | 0.6182 | 0 | slot; fruit, classic; fixed_paylines; low |
| 3 | g-033 "Classic Fruit Fiesta" | 0.6051 | 0 | slot; fruit, classic; fixed_paylines; low |
| 4 | g-048 "Classic Fruit Fortune" | 0.5925 | 0 | slot; fruit, classic; fixed_paylines; low |

**g-061 "Fishing Frenzy Pick Bonus"** on aurora/GB, nDCG@5 0. Truth: bingo; fishing; pick_bonus; low.

| # | Item | Score | Grade | Truth |
| --- | --- | --- | --- | --- |
| 1 | g-022 "Reel Catch Adventure" | 0.6729 | 0 | slot; fishing, underwater; cash_collect, free_spins; medium |
| 2 | g-037 "Ocean's Bounty Cash Collect" | 0.6723 | 0 | slot; fishing, underwater; cash_collect, free_spins; medium |
| 3 | g-090 "Catch of the Day Scratch" | 0.6192 | 0 | instant_win; fishing; scratch_card; low |

**g-090 "Catch of the Day Scratch"** on aurora/GB, nDCG@5 0. Truth: instant_win; fishing; scratch_card; low.

| # | Item | Score | Grade | Truth |
| --- | --- | --- | --- | --- |
| 1 | g-061 "Fishing Frenzy Pick Bonus" | 0.6192 | 0 | bingo; fishing; pick_bonus; low |
| 2 | g-037 "Ocean's Bounty Cash Collect" | 0.5785 | 0 | slot; fishing, underwater; cash_collect, free_spins; medium |
| 3 | g-022 "Reel Catch Adventure" | 0.5674 | 0 | slot; fishing, underwater; cash_collect, free_spins; medium |

**g-008 "Secrets of the Sphinx"** on harbour/GB, nDCG@5 0.184. Truth: slot; egyptian; cascading_reels, multipliers; high.

| # | Item | Score | Grade | Truth |
| --- | --- | --- | --- | --- |
| 1 | g-002 "Pharaoh's Secret Treasures" | 0.7957 | 1 | slot; egyptian; expanding_wilds, free_spins; medium |
| 2 | g-062 "Pharaoh's Gold" | 0.6663 | 1 | slot; egyptian, classic; fixed_paylines; low |
| 3 | g-053 "Egyptian Scratch Wonders" | 0.6096 | 0 | instant_win; egyptian; scratch_card; low |

Queries where an unrelated (grade-0) game holds the top slot:

- g-019 "Fruit Blast Scratch" (instant_win; fruit; scratch_card; medium) on aurora/GB: #1 is g-021 "Fruit Frenzy Spins" (slot; fruit, classic; fixed_paylines; low), score 0.6535.
- g-061 "Fishing Frenzy Pick Bonus" (bingo; fishing; pick_bonus; low) on aurora/GB: #1 is g-022 "Reel Catch Adventure" (slot; fishing, underwater; cash_collect, free_spins; medium), score 0.6729.
- g-062 "Pharaoh's Gold" (slot; egyptian, classic; fixed_paylines; low) on aurora/GB: #1 is g-053 "Egyptian Scratch Wonders" (instant_win; egyptian; scratch_card; low), score 0.5552.
- g-090 "Catch of the Day Scratch" (instant_win; fishing; scratch_card; low) on aurora/GB: #1 is g-061 "Fishing Frenzy Pick Bonus" (bingo; fishing; pick_bonus; low), score 0.6192.
