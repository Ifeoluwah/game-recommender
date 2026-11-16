# Inspection: the OpenAI-generated catalogue

**Build:** `data/generated/`, generated 2026-11-16 01:46 UTC by `openai:gpt-4o-mini` with prompt `generate-catalogue.v2`. The files are untracked, and nothing was changed during inspection.

**How it was checked:** read-only. A script loaded the four files and checked them against specs 01–03 using the repo's own slate, vocabulary and normaliser. No model was called. Descriptions were scanned with regexes, and 7 were read in full: 5 picked with a seeded random draw (seed 2026), plus both misleading-title games.

## Verdict

**Fit to commit, with caveats.** Every spec 01–03 contract the dataset depends on holds:
- the counts and slate mix;
- the forced cluster attributes, clamps and series studios;
- unique title + studio;
- the closed vocabulary;
- every trap and edge case at its count, and each behaving correctly through normalisation.

The failures below come from the stricter checks added for this inspection, plus one soft breach of the copy rules. None of them breaks a spec 01–03 acceptance criterion. Regenerating with the same prompt and model wouldn't reliably remove them, because the generator has no check for them. So if any of them must be fixed, change the generator first (see "Worth changing before relying on this data").

## Results

| # | Check | Result |
| --- | --- | --- |
| 1 | 108 canonical games, 113 feed records; slate mix 70 / 9 / 9 / 7 / 5 (78 slots with the traps) | **PASS** |
| 2 | Manifest names the model and prompt version, and lists `titleRepairs` | **PASS**: 1 repair, slot 32 ("Sands of Khepri: The Golden Scarab" → "…: The Cursed Tomb", first attempt) |
| 3 | Slate contract: primary theme first, forced attributes exact, ranges clamped, series share a studio, jackpot only with `progressive_jackpot` | **PASS** |
| 4 | Clusters: 4 × (5 + 2), 5 distinct member studios, no repeated titles within a cluster, members share theme and exact mechanics | **FAIL** (1 item): `fishing_cash_collect` has two members titled "Deep Sea Catch" (g-022 Redwater, g-067 Bramble). Everything else passes |
| 5a | No duplicate title + studio | **PASS** |
| 5b | All themes and mechanics in the vocabulary; all studios fictional | **PASS** |
| 5c | Every layout fits its game type | **FAIL** (2 strict, 7 weak): see below |
| 5d | No `live_dealer` on a non-live game | **FAIL** (6): g-012, g-015 (bingo); g-028, g-040, g-041, g-050 (table) |
| 6 | Trap counts and every spec 01 §7.3 edge case at its count | **PASS**: also checked through normalisation (below) |
| 7 | Copy matches the true type and metadata; no RTP, max win or money amounts | **PASS** on RTP, max win and money. **Soft FAIL** on "no win claims": 8 descriptions use win-promise language. 5 descriptions name a mechanic the metadata lacks |

### 1–3. Structure

- **Counts:** 108 canonical games, 113 feed records, 113 reference entries. Base slate (g-001…g-100): 70 slot, 9 table, 9 live, 7 instant win, 5 bingo.
- **Profiles:** 60 rich, 33 partial, 12 thin, 8 title-only. These differ from the offline build's 65/27/13/8, because degradation's draws depend on each game's tag list. That's expected.
- **Volatility:** 26 low, 54 medium, 25 high, 3 extreme. The model made no extreme or bonus-buy game of its own. The only three are the `classic_fruit` extreme near-miss and the two escalation twins, so it kept the "rare" rule.
- **Series:** all 8 share a studio, and titles are related ("Sands of Khepri: …", "Gilded Dragon: …"). One member's title drops most of its series name ("Orchard Bounty"), which is fine.
- **Jackpots:** no game has a jackpot network without `progressive_jackpot`, and no progressive game lacks a network.

### 4. Benchmark clusters

| Cluster | Members / near-misses | Distinct member studios | Repeated titles |
| --- | --- | --- | --- |
| `egyptian_cascade` | 5 / 2 | 5 | none |
| `fishing_cash_collect` | 5 / 2 | 5 | **"Deep Sea Catch" ×2** |
| `classic_fruit` | 5 / 2 | 5 | none |
| `live_game_show` | 5 / 2 | 5 | none |

Every member has the cluster theme first and exactly the forced mechanics. Near-misses reuse the first two studios of the round-robin, so each cluster spans 5 studios across all 7 games. That's as designed: the cap only has to spare members.

Worth knowing: in `live_game_show`, the near-miss g-025 "Spin the Wheel Live" and the member g-007 "Spin the Wheel: Live Edition" have near-identical titles **and** the same studio. That makes the near-miss test harder than intended for anything that embeds titles.

### 5. Uniqueness, vocabulary, layouts

**Same title, different studio** (allowed by spec 01, so these pass 5a, but see the caveats):

| Title | Games |
| --- | --- |
| Roulette Royale | g-028, g-063, g-088 (three different tables) |
| Fruit Frenzy Megaways Spins | g-019 (the misleading-title **scratch card**) and g-095 (the `classic_fruit` extreme **Megaways slot** near-miss) |
| Pharaoh's Fortune | g-013 (high, free spins slot) and g-062 (`egyptian_cascade` near-miss) |
| Deep Sea Catch | g-022 and g-067 (both `fishing_cash_collect` members) |
| Gods of Olympus | g-047 and g-075 (both high-volatility mythology slots with free spins + multipliers) |

The dedupe keys don't collide across these games: none merges with another.

**Layouts that don't fit:**
- **Strict fails:**
  - g-040, a blackjack table with layout "live dealer" (should be a shoe or table);
  - g-072, a `egyptian_cascade` member with "6x5, cascading" (no lines or ways).
- **Weak:** live games with non-layouts: "live_dealer" (g-007, g-065), "live dealer" (g-039), "live studio setting" (g-089) and "live wheel" (g-056).
- **Wrong:** card games on a "single-zero wheel": g-041 (table), g-054 and g-082 (live).

**`live_dealer` on non-live games:** 2 bingo games (g-012 "Bingo Bonanza" and g-015, whose copy says "live dealer action") and 4 tables (g-028, g-041, g-050 roulette or cards; g-040, whose copy calls itself "a live dealer game").

**Missing mechanics:** g-064 (an instant win with no `scratch_card`) and g-082 (a live game) have **no mechanics at all**.

### 6. Traps and edge cases

- **Counts:** all as spec 01 §7.3 and spec 02 §4 expect: 2 market twins, 2 escalation twins, 1 of each lifecycle copy, 1 test build, 3 opaque, 3 duplicate exports, 2 RTP variants, 1 studio/aggregator swap, and 2 each of prompt injection, misleading title, marketing fluff, cold-start, noisy tags and missing markets. Also 1 non-English record and 1 with a missing status. There are 4 seasonal records, so spec 02's trap table will again total 39 rows.
- **Through normalisation**, every one behaves as intended:
  - duplicates and RTP variants share their original's dedupe key;
  - the swap is repaired to the true studio;
  - the test build is caught by its name;
  - lifecycle copies aren't live;
  - market twins aren't licensed in NJ;
  - every non-title-only record of a bonus-buy game still declares `bonus_buy`;
  - no dedupe key is shared by two different games.
- **Edge-case shapes:** each matches spec 01 §7.3 (cold-start date and missing fields; injection text with volatility removed; fluff without specs or volatility; opaque `GAME_####_V1` names).

### 7. Copy quality

**RTP, max win, money:** none. No description states an RTP, a percentage, a currency amount, a max-win multiplier or "up to £…". Two mention "up to 117,649 ways to win" (g-006, g-029), which is a layout fact, not a payout.

**Win-promise language** (spec 01 §5.1 "no win claims"; the prompt says "Do not promise wins"): 8 of 108.
- g-029 "potential big wins";
- g-035, g-070 "massive wins";
- g-043 "reel in big wins";
- g-048 "Spin for a chance to win big!";
- g-085 "the thrill of winning big";
- g-088 "potential big wins";
- g-034 "guarantees fun and excitement".

None is a hostile injection. They're marketing tone. g-048's "win big" and g-034's "guarantee" are on the guard's banned list (spec 04 §6), so any enrichment summary that echoes them will be discarded.

**Copy that names mechanics the metadata lacks:**
- g-003: the description and layout say cluster pays, but `mechanics` has no `cluster_pays`;
- g-042: the copy mentions cascading reels and "hit the jackpot", but there's no `cascading_reels` or `progressive_jackpot`;
- g-098 "Classic Jackpot Rewind" (and its escalation twin g-104): "jackpot" in the title, with no progressive.

Twelve of the 174 metadata mechanics aren't named in their game's copy, mostly `live_dealer`, `multipliers` and `fixed_paylines`.

**Type words:** no description misstates its game type. The only hits are fishing puns ("reel in prizes" on a bingo and a scratch card), which is harmless.

**Sample read:** all 7 descriptions match their true type and metadata.

| Game | Type and metadata | Copy |
| --- | --- | --- |
| g-039 Live Action Table Quest | live; `live_dealer` + `side_bets`; game_show + cards | ✓ live dealer, side bets, cards (layout "live dealer" is weak) |
| g-089 Game Show Extravaganza | live; wheel bonus, multipliers, live dealer | ✓ bonus wheel, multipliers, presenters (layout "live studio setting" is weak) |
| g-017 Deep Sea Collectors | slot; fishing + underwater; cash collect + free spins; medium | ✓ |
| g-093 Gilded Dragon: Rising Sun | slot; asian; cascading reels, multipliers, free spins; high | ✓ (says "massive multipliers") |
| g-033 Fruity Classic Spins | slot; fruit + classic; fixed paylines; low | ✓ 3x3, 5 fixed paylines |
| g-019 Fruit Frenzy Megaways Spins *(misleading title)* | instant win; scratch card | ✓ "Scratch your way through a vibrant grid… instant win game." The title appears in the copy, so the word "Megaways" does too |
| g-057 Festive Spins Bonanza *(misleading title)* | instant win; scratch card; festive | ✓ "a delightful scratch card game" |

In the feed, both misleading-title records keep only their title and description (no category, tags or specs), as spec 01 §7.3 requires. The description is the only evidence of the true type, and in both it's unambiguous.

## What this means for enrichment and matching later

1. **Metadata contradicts its own copy in a few games** (g-003, g-042, g-098/g-104, g-064, g-082).
   - An enricher that correctly reads "cluster pays" from g-003's copy will be scored *wrong*, because the truth lacks it.
   - These few records will pull mechanic precision down and make the silver relevance labels slightly wrong for them.
   - Expect them among spec 06's "wrong fills". They aren't enrichment errors.
2. **"Jackpot" and "wheel" are keyword synonyms** (appendix A2 and A9: `jackpot → progressive_jackpot`, `wheel → wheel_bonus`).
   - The rules enricher reads the title, copy and layout. So every roulette game with a "single-zero wheel" layout will be tagged `wheel_bonus`, and "Classic Jackpot Rewind" will be tagged `progressive_jackpot`.
   - The `wheel_bonus` tags pull roulette tables towards the `live_game_show` members, whose defining mechanic is `wheel_bonus`. That's a near-miss intrusion risk, and it already exists offline.
3. **`live_dealer` on 4 tables and 2 bingo games** blurs table vs live in both raw-text and enriched embeddings. The relevance labels treat table/live as one family, so the ranking penalty is small, but `rules_enriched` and `enriched` will agree with the mistake.
4. **Identical titles across studios are visible to players.**
   - Dedupe works on title + studio, so a roulette rail can show "Roulette Royale" two or three times, and a fruit rail can show both "Fruit Frenzy Megaways Spins" games, one a scratch card and one an extreme Megaways slot.
   - Players see only titles (AGENTS.md rule 4), so they'd see apparent duplicates.
   - The same titles also pull these pairs together in any embedding that includes the title.
5. **The misleading-title trap is stronger than intended.** g-019 shares its exact title with a real extreme-volatility Megaways slot (g-095). Its trap row only checks game type, so it passes. But g-095 will rank high for g-019 and the reverse, and the policy layer should block that pair (low or medium → extreme).
6. **Weak layouts flow into the embedding text** ("Layout: live_dealer", or a "single-zero wheel" on card games), adding noise, and pulling card games towards roulette.
7. **Win language in 8 descriptions** may be echoed by the LLM's matching summary. The guard discards such summaries rather than repairing them, so those records embed with a weaker summary. No player impact.
8. **Volatility in copy is consistent:** 25 descriptions name a volatility and none contradicts the truth. That includes the escalation anchors, whose volatility was forced to low after generation; their copy doesn't state a volatility.

## Worth changing before relying on this data

These need a spec 01 change and a regeneration. None is required by the current specs.

- **Title uniqueness across studios.** Extend the title repair (spec 01 §6.2) to repeated titles regardless of studio. This fixes the player-visible duplicates (item 4) and the misleading-title pairing (item 5).
- **A copy and metadata check after generation.** Regenerate a slot when its copy uses the guard's banned patterns, names a mechanic its metadata lacks, or its layout doesn't fit its type. That covers items 1, 3, 6 and 7, using the same single-slot repair loop.
- **Prompt v3.** Add explicit rules: no `live_dealer` on table or bingo games, layouts in the listed formats only, and no "big/massive wins". As a prompt change it's a new version and a new evaluation (AGENTS.md rule 8).

---

## Re-inspection, 2026-11-16: the rebuild with generation repairs

**Build:** `data/generated/`, generated 02:06 UTC, `openai:gpt-4o-mini`, prompt `generate-catalogue.v2`. It's the first build with the repairs specified after the inspection above (spec 01 §6.2): cluster-title collisions, layout fit and `live_dealer` removal.

**How it was checked:** the same read-only script, extended to use the repo's own `layoutFit` and to report null layouts, card games on a roulette wheel, empty mechanics and every repaired slot. No data file was changed and no model was called.

This is a fresh model run, so game ids hold different games than in the first build. Problems are compared by kind, not by id.

### Verdict

**Not fit to commit yet**, for one new reason. Two titles look like real brands, which spec 01 §4 forbids ("no real game titles … anywhere") and AGENTS.md repeats ("fictional names everywhere"):

| Game | Title | Why it's a problem |
| --- | --- | --- |
| g-007 | "Wheel of Fortune Live" | A real TV game show and slot brand. It's also a `live_game_show` **member** |
| g-054 | "Casino Royale Live" | A film title |
| g-038 | "Candyland Delight" | Borderline: close to "Candy Land", a board-game brand |
| g-051, g-075 | "Gods of Olympus" | Present in both builds. A slot by that name may exist; not verified |

Everything else that blocked or worried the first inspection is either fixed or a recorded known limitation. Once those titles are regenerated, the build is fit to commit.

The generator has no real-name check today. Two options:
- **a deny-list check in the repair loop** (a spec 01 §6.2 addition, regenerating the slot like any other problem);
- **a rerun**, which is random and could produce other real names.

The first is the durable fix. Your call.

### Results against specs 01–03 (unchanged checks)

| # | Check | First build | This build |
| --- | --- | --- | --- |
| 1 | 108 / 113, slate mix 70 / 9 / 9 / 7 / 5 | PASS | **PASS** |
| 2 | Manifest names model and prompt; lists repairs | PASS (`titleRepairs`, 1) | **PASS:** `repairs`, 14 entries (below) |
| 3 | Slate contract | PASS | **PASS** |
| 4 | Clusters: counts, 5 distinct member studios, shared theme and exact mechanics, **no repeated titles** | FAIL (one repeat) | **PASS:** no repeats; 3 caught and repaired during generation |
| 5 | No duplicate title + studio; vocabulary; **layouts fit**; **no `live_dealer` on non-live** | FAIL on layouts and `live_dealer` | **PASS** on all four |
| 6 | Traps and edge cases at their counts, through normalisation | PASS | **PASS:** 39-row trap table again (4 seasonal); profiles 50 rich, 38 partial, 17 thin, 8 title-only |
| 7 | No RTP, max win or money in copy | PASS | **PASS:** only "117,649 ways", a layout fact |

**The 14 repairs in the manifest:**
- **3 × `cluster_title`:** g-048 "Classic Fruit Fiesta" → "Classic Fruit Delight", g-065 "Spin the Fortune Wheel" → "Fortune Wheel Live", g-083 "Pharaoh's Cascade" → "Cascading Empire: The Pharaoh's Legacy".
- **3 × `layout_regenerated`:** two tables with "5x3, 10 lines" (g-040, g-055), and the misleading-title instant win g-057 with "6x7 Megaways, 117,649 ways".
- **4 × `live_dealer_removed`:** tables g-040, g-041, g-050, g-055.
- **4 × `layout_cleared`:** "live dealer" on g-054 and g-056; "na" on g-082 and g-089.
- Every regeneration succeeded on the first attempt.

### Fixed

| Problem in the first build | Now |
| --- | --- |
| Repeated title inside a cluster ("Deep Sea Catch" ×2) | **Fixed.** No repeats in any cluster; the three this run produced were repaired |
| Layouts contradicting the type ("live dealer" on a table; "6x5, cascading" on a slot) | **Fixed.** No contradictions left: 3 regenerated |
| Placeholder layouts on live games ("live_dealer", "live dealer", "live studio setting") | **Fixed.** None left: 4 cleared to null, including two "na" the first build didn't have |
| `live_dealer` on 6 non-live games | **Fixed** in the metadata: 4 removed this run, 0 left. But see "Remaining", item 2 |
| A misleading-title scratch card sharing its exact title with an extreme Megaways slot | **Gone**, but by chance in this run, not by a rule. The misleading titles are now "Mega Scratch: Fruity Adventure" and "Festive Spins Extravaganza" |
| Near-identical titles for a near-miss and a member in `live_game_show` | **Gone** this run (also by chance) |
| Win-promise copy (8 descriptions) | Down to 5 (g-043, g-056, g-058 and g-087 "big wins/prizes"; g-089 "guarantees fun"). **Kept deliberately** as realistic input for the guard (`REBUILD_NOTES.md`, known limitations) |

### Remaining

1. **Same title from different studios:** 2 groups, down from 5. "Roulette Royale" is on 3 tables (g-050, g-063, g-088), and "Gods of Olympus" on g-051 and g-075. They're not a generation problem under spec 01: the service's display-title dedupe (spec 02 §6.2) keeps namesakes out of one rail.
2. **Copy still says "live dealer" on the 4 tables that lost the mechanic** (g-040, g-041, g-050, g-055: "This live dealer poker experience…", "Engage with live dealers…"). Removing the mechanic fixed the metadata but not the copy.
   - The rules enricher maps "dealer" and "live dealer" to `live_dealer` (appendix A9), and the LLM enricher will read the same words. So enrichment will put `live_dealer` back on these tables, and the evaluation will score it as a wrong fill, because the truth now lacks it.
   - Same family as "metadata contradicts its own copy" in the known limitations; this fix creates new instances of it.
3. **Card games on a "single-zero wheel":** 4 (g-039, g-040, g-041, g-055), up from 3. Two of them (g-040 poker, g-055 blackjack) are the tables the layout repair regenerated. The repair accepted a wheel because the fit rule knows game types, not themes. Cost: these card games' embedding text reads "Layout: single-zero wheel", pulling them towards roulette.
4. **The "wheel" and "jackpot" keyword mappings** (known limitation):
   - the 6 roulette tables' copy says "wheel", so they'll be tagged `wheel_bonus`;
   - g-039 "Live Dealer Jackpot Showdown", a `live_game_show` near-miss, promises "jackpot prizes" with no progressive.

   13 mechanic words in copy aren't in the metadata (15 in the first build).

### New in this build

1. **Real-brand titles:** see the verdict. Not checked by the generator.
2. **More games with no mechanics:** 6, up from 2. Two (g-041, g-050) are empty *because* `live_dealer` was their only mechanic; g-063, g-066 and g-069 (roulette tables) and g-064 (an instant win without `scratch_card`) came back empty from the model.
   - For matching, an empty list means no "Mechanics:" line in the embedding text, and these records can't be "complete" evidence (spec 04 §4), so they go to the LLM.
   - Not wrong, but it's more gap than the first build had.
3. **Null layouts on two `live_game_show` members** (g-056, g-089, plus non-cluster live games g-054 and g-082). Their embedding text has no "Layout:" line while the other three members' do. That's a small, real difference inside the cluster: the "na" placeholders were honest to clear, but the cluster members are now slightly less alike.
4. **A repair replaces the whole game; the manifest records only the field that triggered it.**
   - A `layout_regenerated` entry shows the old and new layout, but the title, description and mechanics were regenerated too, and their old values aren't recorded.
   - The misleading-title trap g-057 survived its regeneration intact (a slot-sounding title, copy that says scratch card), because the repair request carries the slate line with "misleading title". But that relies on the model following it again.
   - Worth recording `before`/`after` titles for every regenerated slot, or keeping the original fields where only the layout was wrong.

### Worth changing next

All of these are spec 01 §6.2 additions, then a rerun:
- **A real-name deny-list check** in the repair loop. It's the blocker.
- **Regenerate instead of strip `live_dealer`** on non-live games, so the copy and the metadata agree (remaining item 2). Or strip it and accept the wrong fills as a known limitation.
- **Theme-aware layout fit for card games:** a deck or shoe, not a wheel (remaining item 3).
- **Record every field a regeneration changed** (new item 4).

---

## Re-check, 2026-11-16: the same 02:06 build, against the repair rules

**What was checked:** `data/generated/`, read-only. No data file was changed and no model was called.

**Note: this is the build re-inspected above, not a new one.** All four files are still the ones written at 02:06:19, with `generatedAt` `2026-11-16T02:06:19.418Z`. Since then no generator change and no rerun have happened, so none of the "worth changing next" items above is in this data. The re-check confirms the repair rules hold on it and looks for what the earlier passes missed.

The checks use the repo's own `layoutFit` and `titleKey` (`src/catalogue/repairs.ts`) and normaliser, so they test exactly what the generator enforces.

### Results

| # | Check | Result |
| --- | --- | --- |
| 1 | 108 canonical / 113 feed / 113 reference; base mix 70 / 9 / 9 / 7 / 5 (78 slots with traps) | **PASS** |
| 1 | Manifest lists 14 repairs across the four kinds | **PASS:** 3 `cluster_title`, 3 `layout_regenerated`, 4 `live_dealer_removed`, 4 `layout_cleared`. Every repair's `after` matches the final data |
| 2 | No repeated title within any benchmark cluster, whatever the studio | **PASS:** none (compared case- and punctuation-insensitively, as the generator does) |
| 3 | No `live_dealer` on a non-live game | **PASS** in the canonical catalogue, **and** in the normalised feed: no non-live record normalises to `live_dealer` |
| 4 | Every layout fits its game type or is null | **PASS on the rule:** 104 fit, 4 are null (all live games), and no slot has a null layout. The 4 cleared layouts are absent from the feed, and normalise to null |
| 4 | …including card games on a "single-zero wheel" (the case the rule doesn't catch) | **FAIL, 4 games:** g-039 "Live Dealer Jackpot Showdown" (live, game_show + cards), g-040 "Card Clash: Poker Showdown", g-041 "High Stakes Hold'em" and g-055 "Card Duel: Blackjack Royale" (tables). Two of the tables (g-040, g-055) got that layout from the layout repair itself |

### New: not flagged by the earlier inspections

1. **Game shows on a roulette wheel.** Two `live_game_show` members, g-007 "Wheel of Fortune Live" and g-080 "Spin & Win Live", have the layout "single-zero wheel". So does near-miss g-025 "Showdown Roulette Live", which is genuinely roulette.
   - A game show's money wheel isn't a single-zero roulette wheel, and the shared layout string puts these members closer to the roulette near-miss in the embedding text ("Layout: single-zero wheel").
   - The cluster's member layouts are now inconsistent: two roulette wheels, one "single-wheel", two null.
   - This is the same blind spot as the card games: the fit rule knows game types, not themes.
2. **One misleading-title trap no longer misleads.**
   - g-019 is "Mega Scratch: Fruity Adventure". The title names its true type ("Scratch") and contains neither "Megaways" nor "Spins", which the prompt asks for.
   - Spec 02's trap row for it (`e.gameType === truth.gameType`) will pass trivially, so it no longer tests whether enrichment trusts copy over a slot-sounding title.
   - g-057 "Festive Spins Extravaganza" still does its job.
   - Nothing checks the misleading-title shape after generation, so a regeneration or rerun can quietly lose the trap.
3. **Near-duplicate titles that exact-title checks miss.**
   - **Not related:**
     - g-046 "Mystic Forest Quest" and g-096 "Mystical Forest Quest";
     - g-046 and g-103 "Mystical Forest Quest Xtreme", g-096's escalation twin. A player on g-046 may see a near-namesake that is an extreme bonus-buy trap. The policy layer blocks the twin, but the names are confusable;
     - g-087 "Fruit Frenzy Megaways" (a non-cluster Megaways slot) and g-095 "Fruity Megaways Frenzy" (the `classic_fruit` extreme near-miss).
   - **Inside a cluster:**
     - `live_game_show` has three "Fortune Wheel" names: g-007 "Wheel of Fortune Live", g-056 "Spin the Fortune Wheel" and g-065 "Fortune Wheel Live";
     - `classic_fruit` has g-021 "Fruit Fiesta Spins" and g-033 "Classic Fruit Fiesta".
   - **The repair loop produced one of these.** g-065 was a `cluster_title` repair of "Spin the Fortune Wheel"; the model answered "Fortune Wheel Live". That passes the exact-match rule but not its purpose, since titles go into the embedding text.
   - The service's display-title dedupe (spec 02 §6.2) compares normalised titles exactly, so it doesn't catch these either.
4. **No repaired slot is a trap anchor.** This rules out a risk: a regenerated anchor would have silently changed its traps' copies. That's luck of this run, not a rule.

**Still present from the previous re-inspection:**
- the real-brand titles g-007 "Wheel of Fortune Live" and g-054 "Casino Royale Live" (and borderline g-038 "Candyland Delight");
- 6 games with no mechanics;
- copy that still says "live dealer" on the 4 tables that lost the mechanic;
- the "wheel"/"jackpot" keyword mappings.

### Fit to build on?

**For the next milestones, yes.** Specs 04–06 are developed and tested on the offline build (spec 05 §9: tests never read either build's files). This data's structure is correct: counts, slate contract, clusters, traps, and the repair rules all hold. So the enrichment, index and service work can go ahead.

**As the committed OpenAI build that gets enriched and evaluated, no.** It's the same verdict as the previous re-inspection, now with two more reasons:
- **blocker:** real-brand titles, a spec 01 §4 hard rule;
- **weakens the evaluation:** one of the two misleading-title traps no longer tests anything;
- **distorts what the cluster metrics measure:** near-duplicate titles inside `live_game_show`, and game-show members on a roulette layout.

**Before the next OpenAI rerun,** these spec 01 §6.2 additions would close every open item:
- a real-name deny-list check;
- a misleading-title shape check (slot-sounding title, no true-type word);
- near-duplicate title detection within clusters (word overlap, not exact match);
- theme-aware layout fit: card games need a deck, shoe or table; game shows a money wheel, not a single-zero wheel;
- recording every field a regeneration changes.
