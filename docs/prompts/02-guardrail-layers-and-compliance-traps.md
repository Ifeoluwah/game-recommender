# Spec 02: guardrail layers and compliance traps

> **How to use this spec.** `Read @AGENTS.md and implement @docs/prompts/02-guardrail-layers-and-compliance-traps.md`.
> It builds on [spec 01](01-dataset-spec.md) (the base dataset must exist), and spec 03 builds on it.
> It has two halves: **dataset additions** (trap games, opaque records, seasonal titles) and the **rules and checks** those traps exist to test.
> Where this spec and `AGENTS.md` disagree, `AGENTS.md` wins. Flag the conflict rather than guessing.

## 1. Goal

Prove that the recommender knows what it can trust, what it **may** show, what it **should** show, and when to show nothing, rather than only that embeddings find similar games.

Every trap is a near-copy of a real game, so it ranks at or near the top by similarity alone. Only the right guardrail can stop it.

## 2. The four guardrail layers

| Layer | Question | Where it's enforced |
| --- | --- | --- |
| 1. Information integrity | Can we trust what enrichment says? | Build time: the LLM may infer descriptive fields only |
| 2. Hard eligibility | May this game legally/operationally be shown to this player? | Request time, before ranking, failing closed |
| 3. Recommendation policy | Even if allowed, should we nudge this player to it? | Request time, after eligibility |
| 4. Abstention | Do we know enough to recommend anything? | Build time (insufficient flag) and request time (too few results) |

**Principle: similarity proposes, rules dispose.** No similarity score can override layer 2 or layer 3.

## 3. Deliverables

| Path | What |
| --- | --- |
| `src/catalogue/traps.ts` | `addTrapGames(canonical, seed = 777) → { canonical, specials, anchors, anchorOf }` (section 4.1) |
| `src/catalogue/degrade.ts` | Opaque records, seasonal labelling, lifecycle status strings; keeps anchors clean (section 4.2) |
| `src/pipeline/normalise.ts` | Lifecycle statuses, test-build detection, season months (section 5) |
| `src/service/recommender.ts` | `eligibilityProblems`, `policyProblems`, ordered filtering, decline reasons, per-layer diagnostics (section 6) |
| `config/service.json` | Brands → markets, restricted mechanics per market, policy thresholds (section 6). Write the whole file here, including spec 05 §6.3's `recommendation` block, which `recommend()` needs |
| `src/service/service-config.ts` | `ServiceConfigSchema` (Zod) and its loader. Not `src/config.ts`, which holds path constants only |
| `src/domain/index-schema.ts` | `ServiceGame` (spec 05 §4.3), the record `recommend()` works on |
| `eval/release-gates.json` | Gates grouped by layer (section 7) |
| `eval/run-eval.ts` | **Built in spec 06.** This spec defines the exhaustive ground-truth checks and trap table it must run (section 7); AC4 is checked once it exists |
| `tests/recommender.test.ts`, `tests/normalise.test.ts`, `tests/pipeline.test.ts` | Section 8 |

## 4. Dataset additions

### 4.1 Trap games (`addTrapGames`, seed 777)

Run after `assembleCanonical` and before degradation.

**Picking the originals ("anchors"):**
- Choose from live, standalone slots: `status === "active"`, game type slot, no series, not in a benchmark cluster.
- Prefer those with descriptions over 40 characters. Fall back to any live standalone slot if fewer than 7 qualify. Fail loudly if there are still fewer than 7.
- Sample 7 with the seed: 2 for market twins, 2 for escalation twins, 3 for lifecycle copies.
- New trap games get the next sequential ids (`g-101`, `g-102`, …).
- Festive and bonus-buy games are **not** excluded from the anchor pool. In the reference draws, two lifecycle anchors are festive (so are their copies, and the test build copied from one of them). That's fine because the trap check runs in both July and December (section 7): in December the season rule doesn't apply, so the status or test rule is what has to block the copy. A rebuild may exclude festive anchors; if so, say so.
- Exact code: [appendix A8](appendix-reference-values.md#a8-trap-games).

**Market twins (2).** Test layer 2, the licence check.

| | Anchor (modified) | Twin |
| --- | --- | --- |
| Brands | add `liberty` (the NJ brand) | same as anchor |
| Markets | add `GB` and `NJ` | anchor's markets **minus NJ** |
| Title | unchanged | `"<anchor title> II"` |
| Series | `"<anchor id>-family"` | same family (a genuine variant) |

Expected: the twin is never shown to an NJ player on `liberty`, even though it's the anchor's #1 neighbour. In Europe it's a legitimate related game.

**Escalation twins (2).** Test layer 2 (bonus buy restricted in GB) and layer 3 (risk escalation).

| | Anchor (made gentle) | Twin |
| --- | --- | --- |
| Volatility | `low` | `extreme` |
| Min / max bet | £0.10 / £5 | £2 / £500 |
| Max win | at most 1,000× | 50,000× |
| Mechanics | unchanged | anchor's + `bonus_buy` |
| Markets | add `GB` and `ES` | same as anchor |
| Title | unchanged | `"<anchor title> Xtreme"` |
| Description | unchanged | anchor's + " Extreme volatility with Bonus Buy to jump straight into the feature." |

Expected: in GB the twin is blocked by eligibility (restricted feature). In ES, where bonus buy is allowed, it's blocked by policy (volatility jump and stake jumps).

**Lifecycle copies (3).** Copies of three anchors, no series, no cluster:

| Status | Title suffix |
| --- | --- |
| `suspended` | `" Deluxe"` |
| `certification_expired` | `" Classic"` |
| `demo_only` | `" Demo"` |

**Test build (1).**
- A copy of the first lifecycle anchor.
- Title `TEST_<ANCHOR_TITLE_UPPER_SNAKE>_V2`, with `isTestGame: true` but `status: "active"` (the feed says it's live).
- The feed does **not** send an `is_test_game` flag for it, so only name-based detection can catch it.

Return:
- `specials`: trap id → `market_twin | escalation_twin | lifecycle_suspended | lifecycle_cert_expired | lifecycle_demo_only | test_game`;
- `anchors`: the 7 anchor ids;
- `anchorOf`: trap id → anchor id.

The total becomes **108 canonical games**.

### 4.2 Degradation changes (in `degrade`, seed 1234)

- **Trap games and anchors** always get the `rich` profile, so each trap tests one thing. Anchors are excluded from every other edge case.
- **Feed status strings:** `suspended` → `"SUSPENDED"`, `certification_expired` → `"CERTIFICATION_EXPIRED"`, `demo_only` → `"DEMO_ONLY"`. Withdrawn games also emit `"maintenance"` sometimes.
- **Seasonal titles:** every canonical game with `seasonMonths` (festive theme) emits `available_months`, and gets the `seasonal` label if it has no other trap.
- **Opaque records (3):**
  - The last 3 of the 25 edge-case picks (spec 01's selection: 12 edge cases, 3 duplicates, 2 RTP variants, 5 title-only, then these 3).
  - Profile `title_only`; `name: "GAME_<4 digits>_V1"`; `studio: "Unknown"`; `tags: []`; `description: null`.
  - The real game behind it is still in the canonical file, but nothing downstream may know it.
- The edge-case pool excludes trap games, anchors, cluster games and seasonal titles.
- `reference[].relatedTo` is set to the anchor id for every trap game.

### 4.3 Expected composition

| Trap | Count | Layer |
| --- | --- | --- |
| Market twin | 2 | 2 |
| Bonus-buy twin (in GB) | 2 (the escalation twins) | 2 |
| Escalation twin (outside GB) | 2 (same records) | 3 |
| Suspended, certification-expired, demo-only copies | 1 each | 2 |
| Test build with live status | 1 | 2 |
| Seasonal titles | all festive games (~4–5) | 2 |
| Missing licence data / missing status (from spec 01) | 2 / 1 | 2 |
| Title-only (from spec 01) | 5 | 1 + 4 |
| Opaque record | 3 | 1 + 4 |

## 5. Normalisation rules for these traps

- **Status:** only `live`, `active` or `enabled` (any case) is live. Everything else is not live: SUSPENDED, CERTIFICATION_EXPIRED, DEMO_ONLY, maintenance, unknown values and missing. A present value gets the issue `status_not_live:<value>`; a missing one gets `status_missing_fail_closed` (appendix A13).
- **Test builds:** `is_test_game` true, `"Y"`, `"yes"` or `"1"`, **or** a title starting `TEST`, `QA` or `DEV` followed by `_`, space or `-`.
- **Season:** `available_months` absent → null (all year). Present → sorted unique months 1–12. Present but unreadable (not a list, or no valid month) → `[]` with issue `season_unreadable`, so the game is never in season. Fails closed, as spec 01 §8 and appendix A13 say.
- **Studio "Unknown"** → provider null.

## 6. Service rules

### 6.1 Config (`config/service.json`)

```json
{
  "brands": {
    "aurora":   { "enabled": true,  "markets": ["GB", "ES", "SE", "NL"] },
    "harbour":  { "enabled": true,  "markets": ["GB", "ES", "SE", "NL"] },
    "meridian": { "enabled": false, "markets": ["GB"] },
    "liberty":  { "enabled": true,  "markets": ["NJ"] }
  },
  "restrictedMechanicsByMarket": { "GB": ["bonus_buy"] },
  "policy": { "maxVolatilityStepUp": 1, "maxStakeMultiplier": 5, "maxMinStakeMultiplier": 10 }
}
```

The policy numbers are product and safer-gambling choices, owned with compliance. They aren't a claim that a regulation requires these exact values.

On bonus buy: in 2020 the UKGC told operators to remove feature buy-ins, so it's modelled as a market restriction in config, not as a cited legal ban.

### 6.2 Request flow (`recommend`), in this order

1. Brand unknown or disabled → `BRAND_DISABLED`. Then, market not served by the brand → `MARKET_NOT_SERVED_BY_BRAND`. This is the order inside `recommend()`. The HTTP layer (spec 05 §6.2) validates first: an unknown brand → `400 unknown_brand`, and a brand not offered in the market → `400 brand_not_offered_in_market`, which is the same condition under its HTTP name. So over HTTP a disabled brand in a market it doesn't serve gets the 400, and a disabled brand in a market it does serve gets a 200 decline with `BRAND_DISABLED`. Then, header `x-player-restricted: true` → `PLAYER_RESTRICTED`, not cached. This comes before every seed check, so the reason a restricted player gets never depends on the game. Full order: brand → market → restriction → `UNKNOWN_GAME` → `SEED_NOT_AVAILABLE` → `INSUFFICIENT_SOURCE_DATA`.
2. Seed checks:
   - unknown → `UNKNOWN_GAME` (404);
   - not licensed in the market, or a test build → `SEED_NOT_AVAILABLE`;
   - flagged insufficient → `INSUFFICIENT_SOURCE_DATA`.
   - **Deliberately not checked on the seed:** status, brand and season. The player is on that game's page, and a game being withdrawn or out of season is exactly when alternatives are useful. Every **candidate** still goes through all of layer 2.
3. For each precomputed neighbour, in score order, until the limit is reached or the score drops below the embedder's threshold:
   - **Layer 2, `eligibilityProblems`:** `not_live`, `test_game`, `not_on_brand`, `not_licensed_in_market`, `out_of_season` (using the request month, default the current UTC month), `feature_restricted_in_market`.
   - **Layer 3, `policyProblems`:**
     - *Volatility cap* = rank(seed volatility, treating unknown as `low`) + `maxVolatilityStepUp`. A candidate above the cap → `volatility_escalation`. A candidate with unknown volatility → `volatility_unknown`, unless the cap already admits `extreme`.
     - *Stakes fail closed too.* A candidate missing either stake → `stake_unknown`. A seed missing a stake is treated as the most cautious player: max £2, min £0.10, the bottom of the generated ranges (`UNKNOWN_SEED_MAX_STAKE` and `UNKNOWN_SEED_MIN_STAKE`). The feed carries stakes on every record except title-only ones (spec 01 §7.1), so this rarely fires, but unknown must never mean allowed.
     - *Max bet* above seed × `maxStakeMultiplier` → `stake_escalation`.
     - *Min bet* above seed × `maxMinStakeMultiplier` → `min_bet_escalation`.
   - **Quality:** a candidate flagged `insufficient` → skip (`quality:thin_record`). A duplicate or RTP variant → skip: its dedupe key matches the seed's or that of an item **already accepted** into the rail (`quality:duplicate_or_rtp_variant`). Candidates rejected earlier don't count.
   - **Same displayed name → skip** (`quality:duplicate_title`): the candidate's normalised title (lowercased, everything but letters and digits removed) matches the seed's or an accepted item's, even when the studios differ, so the dedupe keys don't match. Players see only titles, so two "Roulette Royale"s in one rail look like a duplicate whatever the catalogue says. A candidate already skipped as a duplicate or RTP variant isn't counted again here.
   - **No visible relation to the seed → skip** (`quality:no_shared_theme`): the candidate must share at least one theme with the seed, **or** be in the same series (both `seriesId` non-null and equal). Themes are the guarded enriched themes carried on `ServiceGame` (spec 05 §4.3). It fails closed: a seed or candidate with no themes can only pass through a series, and a null series never matches another null. **Same studio is not enough**, which was a deliberate choice: the catalogue has 6 studios for 113 records, so "same studio" relates each seed to about a fifth of the catalogue whatever its theme, and the rule stops filtering. Measured on the OpenAI build with a studio clause: bad-rec 0.385 instead of 0.137. *Why, independent of any metric:* "Because you played X" tells the player the rail is related to X, and theme and series are the relations a player can see. A rail of same-mechanic games with unrelated themes looks broken even when every item is eligible. Counted alongside the other quality problems of the same candidate.
   - Order of checks per candidate: eligibility, policy, quality, diversity. **The first layer that finds a problem ends the candidate's checks.** Every problem within that layer is counted, and later layers aren't checked or counted. So a candidate that fails layer 2 isn't checked against layer 3, and one that fails policy isn't counted under quality or diversity.
   - **Diversity:** at most 3 per studio and 2 per series, counted over the items accepted so far. The seed doesn't count towards either cap. A null studio counts as the studio `"unknown"`; a null series isn't capped.
   - The loop stops at the first neighbour below the threshold (neighbours are sorted).
4. Fewer than `min(minResults, limit)` survivors → `NO_CONFIDENT_MATCHES` (layer 4), with `minResults = 3`. The `limit` is clamped to 1…`maxLimit`.
5. Return per-layer **diagnostics**: counts keyed `<layer>:<rule>` (e.g. `eligibility:not_licensed_in_market`, `policy:stake_escalation`, `quality:duplicate_or_rtp_variant`, `diversity:provider_cap`). A candidate with several problems counts once per problem. Diagnostics are logged and used by the evaluation, never sent to clients.

Exact code for the per-candidate rules: [appendix A10](appendix-reference-values.md#a10-eligibility-and-policy). The loop around them isn't in the appendix; the prose above defines it. If a rebuild's offline ranking numbers (START_HERE §3) don't match, check this loop first.

## 7. Evaluation for these layers

**Gates** (`eval/release-gates.json`), grouped by layer:

| Layer | Gate | Rule |
| --- | --- | --- |
| information | `protectedFieldViolations`: authoritative fields differ from the rules-only normalisation | 0 |
| information | `regulatedFieldsInvented`: RTP, max bet, min bet or max win filled where the source had none | 0 |
| information | `crypticRecordFabrications`: any inferred field on an opaque record | 0 |
| eligibility | `eligibilityViolations` | 0 |
| eligibility | `duplicateViolations` | 0 |
| policy | `policyViolations` | 0 |
| abstention | `expectedDeclineRate`: title-only and opaque seeds declined | ≥ 0.8 |
| abstention | `coverage`: answerable queries actually answered (1 − false abstention) | ≥ 0.8 |

**Check against ground truth, exhaustively.**
- For every game × every configured brand (disabled ones included: they decline with `BRAND_DISABLED`, which shows that rule working) × every market that brand serves, in **July and December**, call `recommend` with `limit = maxLimit` (12), so the whole rail is checked. A record's "served" count is the sum over both months.
- Check each returned item against the **canonical** record, not the service's own rules: status, test flag, brand, market, season, restricted mechanics.
- Check for the same canonical game as the seed or another item.
- Check policy using canonical volatility and stakes.

This way a normalisation bug, such as a missed test build, shows up as a violation.

**Trap table:** one row per planted record, with these columns: layer, trap, record, what happened, ok. It covers spec 01's data-quality edge cases as well as this spec's traps. For twins and copies, include the trap's **similarity rank** in its anchor's neighbour list, to show how close it came.

The rows below give **39 in total** on the reference dataset. The total holds for the reference draws only: the seasonal count is chance (spec 01 §6.1), so a prose-only rebuild gets a different number of seasonal rows. Here `e` is the enriched record, `truth` the canonical one, and "served" counts come from the exhaustive check (for the seasonal row, July's count).

**Which records each row covers.** Rows are selected by the reference entry's `specials`:

| Trap label | Selected by |
| --- | --- |
| Prompt injection, Misleading title, Marketing fluff | `prompt_injection`, `misleading_title`, `marketing_fluff` |
| Opaque record | `cryptic` |
| Title only | profile `title_only` **and not** `cryptic` (there's no `title_only` special) |
| Seasonal title | `seasonal` |
| Licence data missing, Status missing | `markets_missing`, `status_missing` |
| Market twin, Bonus buy in GB, Volatility/stake escalation | `market_twin`; `escalation_twin` (one row each for eligibility and policy) |
| Status suspended / certification_expired / demo_only | `lifecycle_suspended`, `lifecycle_cert_expired`, `lifecycle_demo_only` |
| Test build with live status | `test_game` |
| Cold-start release | `new_release` |
| RTP variant, Duplicate export, Studio/aggregator swapped | `rtp_variant`, `duplicate_export`, `studio_aggregator_swap` |

| Layer label | Trap label | Rows | ok when |
| --- | --- | --- | --- |
| 1 Information | Prompt injection | 2 | the final summary passes the summary lint |
| 1 Information | Misleading title | 2 | `e.gameType === truth.gameType` |
| 1 Information | Marketing fluff | 2 | no mechanic was inferred that the truth lacks (ignore source-provenance mechanics), **and** volatility wasn't inferred by the LLM |
| 1 Information + 4 Abstention | Opaque record | 3 | none of game type, themes, mechanics or volatility has provenance `llm`/`rules`; insufficient; RTP null |
| 1 Information + 4 Abstention | Title only | 5 | one row per record whose reference entry has the `title_only` label (the 5 picks from spec 01 §7.3; the 3 opaque records have their own rows): RTP and max win null, and flagged insufficient |
| 2 Eligibility | Seasonal title | 4 | served 0 times in **July** across the exhaustive check (the December count is reported, not judged) |
| 2 Eligibility | Licence data missing | 2 | served 0 times in **either month** |
| 2 Eligibility | Status missing | 1 | served 0 times in either month |
| 2 Eligibility | Market twin (not licensed in NJ) | 2 | absent from its anchor's rail in the NJ context |
| 2 Eligibility | Bonus buy in GB | 2 | escalation twin absent from its anchor's rail in the GB context |
| 3 Policy | Volatility/stake escalation | 2 | escalation twin absent from its anchor's rail in a non-GB context |
| 2 Eligibility | Status suspended / certification_expired / demo_only | 3 | served 0 times in either month |
| 2 Eligibility | Test build with live status | 1 | served 0 times in either month |
| 4 Abstention | Cold-start release (should answer) | 2 | as a seed, in the first of GB, NJ, ES, SE, NL where an enabled brand carries it (this order is deliberate: NJ second, so a `liberty`-only release is still tested; spec 03 §7's served recall uses EU markets only, which is a different purpose), the result is `ok`, **or** it declines `NO_CONFIDENT_MATCHES` while ground truth has fewer than `min(minResults, limit)` related games for it there (distinct canonical games with grade ≥ 1, not insufficient, eligible and within policy by the canonical records). Only a decline where a related rail existed is a false abstention. *Revised with `quality:no_shared_theme`:* in this small catalogue a cold-start release can have only two eligible theme-mates in its context (offline g-020 on liberty/NJ), and declining then is correct. The ground-truth count is shown in the row |
| Ranking | RTP variant | 2 | its dedupe key equals the original's |
| Ranking | Duplicate export | 3 | its dedupe key equals the original's |
| Ranking | Studio/aggregator swapped | 1 | studio resolved to the true provider **and** the dedupe key equals the original's |

Rows are produced in feed order, one per (record, label). A duplicate that is also the swapped one gets both rows. The console prints `Planted traps: X/Y handled correctly`, listing misses.

**Choosing the context for an anchor row** (and for the cold-start row), market first:
- For each market in the preference list, in order, take the first brand in `config/service.json` key order (`aurora`, `harbour`, `meridian`, `liberty`) that is enabled, carries the game and serves that market, provided the game is licensed there. The first market where such a brand exists gives the context.
- A brand-first reading doesn't work: `aurora` carries most anchors but never serves NJ.
- The market preference is: `["NJ"]` for the market twin, `["GB"]` for the escalation twin's eligibility row, `["ES","SE","NL","NJ"]` for its policy row, and `["GB","NJ","ES","SE","NL"]` for a cold-start seed.
- A row is ok when the trap is absent from the anchor's rail in that context.
- When an anchor isn't licensed in any preferred market, the row says so and fails. The escalation anchors are always given GB and ES (section 4.1), so this doesn't happen for them.

## 8. Acceptance criteria

All pass with no API key.

1. **`tests/pipeline.test.ts`:** `addTrapGames` returns exactly 2 market twins, 2 escalation twins, 3 lifecycle copies and 1 test build. Each trap shares its anchor's themes. Market anchors include NJ, twins don't. Escalation anchors are low and twins extreme with `bonus_buy`. The test build is active with `isTestGame` true. The degraded feed contains `cryptic` and `seasonal` labels.
2. **`tests/normalise.test.ts`:** every non-live status → not live. Test builds detected by flag and by name. Season months parsed.
3. **`tests/recommender.test.ts`:**
   - a test build, an out-of-season title, a bonus-buy game in GB and an unlicensed game are never shown, even at similarity rank #1;
   - seasonal titles are shown in season, and bonus buy outside GB;
   - one volatility step up is allowed, two aren't; unknown volatility fails closed both ways;
   - a max bet of £5 → £500 and a min bet of 10p → £2 are blocked;
   - `MARKET_NOT_SERVED_BY_BRAND` is returned;
   - diagnostics name the rule that removed a candidate.
4. `npm run eval -- --provider=offline`: every eligibility, policy and information gate is 0, and every trap row reads `ok`. (Checked once spec 06's runner exists.)

## Decisions

| Point | Decision | Why |
| --- | --- | --- |
| Call everything "compliance traps" | **Changed:** compliance/eligibility vs data-quality/reliability | They test different failure layers; the report groups them by layer |
| "High volatility recommendations violate regulation" | **Rejected as stated** | Too strong; modelled as a configurable product/safer-gambling policy owned with compliance |
| "Bonus buy is banned in the UK" | **Reworded** | The UKGC told operators in 2020 to remove feature buy-ins; modelled as a per-market restriction in config, not a cited legal ban |
| Real brand names (`bally-nj`, `virgin-games`) | **Changed:** fictional `liberty`, `aurora`, `harbour`, `meridian` | No impersonation of real brands |
| Title-only records | **Option B:** sent to the LLM, results stored as low-trust, record never recommended | Some titles are evidence ("Megaways"); misleading titles show why it can't be trusted for ranking |
| Unknown stakes in the policy | **Added: fail closed** after a spec-only rebuild of the prototype asked what to do. It never occurred in the prototype's data, because stakes travel with every non-title-only record | Unknown must not mean allowed, for any rule |
| Seed status and season | **Not checked, on purpose** | Alternatives are most useful on the page of a game being withdrawn; candidates are always checked |
| Unknown volatility in the policy | **Changed to fail closed** after the evaluation found low→high escalations slipping through records with missing volatility | Same principle as eligibility |
| How to check the rules | Against **ground truth**, exhaustively (every game × brand × market, July and December) | Checking the service against its own rules would hide normalisation bugs |
| "Trending" fallback, `min_age` | **Rejected** | A fallback belongs to a different rail owned by the lobby; age is verified at account level |
| Anchor selection | **Hardened** after a crash with short descriptions: fall back, then fail loudly | A generator that silently produces fewer traps would weaken the evaluation unnoticed |
| Check order inside `recommend()` | **Specified** (§6.2): restriction before seed checks; dedupe against accepted items only; the first failing layer ends a candidate's checks; the seed doesn't count towards the caps | The appendix quotes only the rule functions, and the ranking numbers depend on the loop. Left open, two rebuilds could disagree |
| Context for anchor and cold-start rows | **Market first**, brands in config order | A brand-first reading picks a brand that can't serve the preferred market (`aurora` in NJ) |
| Disabled brands in the exhaustive check | **Included** | They decline, so they can't add violations, and they exercise `BRAND_DISABLED` |
| Two games with the same displayed name in one rail | **Skipped** (`quality:duplicate_title`), on the normalised title as well as the dedupe key | Players see only titles. The first OpenAI build has three different tables called "Roulette Royale"; title + studio dedupe would show them side by side. Cost: a genuinely different game with a reused name is never shown next to its namesake. And the offline data's same-title cluster games ("Prize Wheel Live" ×3) now dedupe too, so the offline served-recall and ranking numbers in START_HERE §3 (measured on the prototype, which didn't do this) are re-baselined at milestone 6 |
| A candidate with no visible relation to the seed | **Skipped** (`quality:no_shared_theme`): it must share a theme or a series with the seed. Same studio was proposed and dropped after measurement (§6.2). Threshold kept at 0.45 | The first OpenAI evaluation (`docs/notes/threshold-analysis.md`) found 78% of unrelated items in queries where even the oracle declines: the failure was a missing decline, not bad ranking. Raising the threshold to 0.69 instead was rejected: it lands exactly on the coverage gate, and OpenAI embeddings move between rebuilds. **Caveat:** the silver labels grade largely on theme overlap, so this rule aligns the service with the metric by construction, and the bad-rec figure is no longer independent evidence until a curator golden set confirms it. Cost: on the OpenAI build `NO_CONFIDENT_MATCHES` rises from 11 to 89 of 184 queries (all declines 39 → 117), every theme the enricher misses becomes a decline, and same-type tables with different themes are declined (g-050) |
