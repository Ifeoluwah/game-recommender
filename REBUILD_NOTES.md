# Rebuild notes

The record of choices made while building this repo from its specs: where a spec was silent, ambiguous or contradictory, and what was decided. The specs in `docs/prompts/` stay the source of truth. Each flag below was fixed in the spec text it belongs to, with a Decisions row where it changed behaviour. This file only says where.

## Planning flags (resolved 2026-11-16, before any code)

Raised in `docs/plan.md`. "Changed" marks a resolution that differs from the plan's first proposal.

- **P-1** Eval-dependent acceptance criteria deferred to spec 06: spec 02 §3 and §8 AC4; spec 03 §2 and §9 AC5.
- **P-2** Utilities, `JsonLlm` and `resolveProviderMode` built in spec 01: spec 01 §3; spec 04 §2; spec 05 §2.
- **P-3** Spec 07 treated as verification in a spec-first build: spec 07 provenance note and §2.
- **P-4** Seed-availability ADR rows written with the ADR: spec 07 §2 and §3.6; spec 08 §2.
- **P-5** README and `EVALUATION.md` created early, extended in spec 08: spec 03 §2; spec 06 §2; spec 08 §2.
- **P-6** *Changed:* appendix exporter and drift check dropped. `package.json` script removed; START_HERE §2–3; appendix header; `docs/prompts/README.md`; `AGENTS.md` command list; spec 07 AC7 and Decisions; spec 08 §5.8, §6 and Decisions.
- **P-7** *Changed:* stale `normaliseMonths` comment corrected now; behaviour unchanged: appendix A13.
- **P-8** *Changed:* file format fixed as `JSON.stringify(value, null, 2) + "\n"`, LF, top-level arrays; `stableStringify` defined; `.gitattributes` added to the deliverables: spec 01 §3, §10 and Decisions; spec 05 §4.3; START_HERE §3. Hash result: see "To record during the build".
- **P-9** *Changed:* offline output goes through `enforceSlate` only, not `sanitiseCreative`. The LLM order is parse → sanitise → align → enforce: appendix A4; spec 01 §5.1, §6.2, §6.4 and Decisions.
- **P-10** Generation request line format and the `CreativeGame` fields: spec 01 §6.2.
- **P-11** Node ≥ 20.12 with full ICU; CI on Node 22: spec 01 §11; spec 05 §9 and Decisions.
- **P-12** Cold-start tags may gain a declared feature: spec 01 §7.3.
- **P-13** Missing status records `status_missing_fail_closed`: spec 02 §5.
- **P-14** Trap-table rows selected by specials (title-only = `title_only` profile and not `cryptic`); 39 holds for the reference draws only: spec 02 §7.
- **P-15** Contexts chosen market first, brands in config order: spec 02 §7 and Decisions; spec 03 §7; spec 06 §5.1.
- **P-16** `recommend()` check order, dedupe against accepted items, first failing layer ends checks, caps exclude the seed: spec 02 §6.2 and Decisions.
- **P-17** `IndexSchema`/`ServiceGame` in `src/domain/index-schema.ts`, config schema in `src/service/service-config.ts`: spec 02 §3; spec 05 §2, §4.3 and Decisions.
- **P-18** Boundary test also covers `config.ts` path constants: spec 05 §10 AC3 and Decisions.
- **P-19** Error body shapes and request-counter labels: spec 05 §6.2, §7 and Decisions.
- **P-20** Deterministic demo picks: spec 05 §8.
- **P-21** Only `text-embedding-3-small` has a threshold, stated where users meet it: spec 05 §6.3; spec 08 §5.5; `.env.example`.
- **P-22** Index-level `enrichment` describes the build mode: spec 05 §4.3 and Decisions.
- **P-23** Enrichment-quality denominators (feed records, opaque records excluded, title-only included): spec 06 §4 and Decisions.
- **P-24** Ranking queries use the index's flags; the duplicate effect on the ideal pool is documented: spec 06 §5.1, §5.2 and Decisions.
- **P-25** Exhaustive check includes disabled brands; served counts sum both months: spec 02 §7 and Decisions.
- **P-26** Injectable cache; cache failures aren't caught by the per-record fallback: spec 04 §8 and Decisions; spec 07 AC4.
- **P-27** Cache key uses `llm.id`: spec 07 §3.1.
- **P-28** Sweep points computed as `round(base + k × 0.05, 2)`: spec 06 §5.3.
- **P-29** Coverage reported as a passing abstention gate: START_HERE §3.
- **P-30** Thin-profile description rule matches the appendix: spec 01 §7.1.
- **P-31** Manifest timestamp excluded from determinism checks: spec 01 §9 and §12 AC2.
- **P-32** *Changed:* offline builds go to `data/offline/`, `artifacts/offline/` and `eval/reports/offline/`, all git-ignored; the OpenAI build is the committed one; `demo` and `eval` default to it and exit 1 if it's missing. Updated in:
  - spec 01 §1, §3, §6.4, AC3–4 and Decisions;
  - spec 02 AC4; spec 03 AC4–5;
  - spec 05 §3, §4.3–4.4, §8, §9, AC4 and Decisions;
  - spec 06 §2, §7, AC1 and Decisions;
  - spec 07 §3.2, §4 and AC7;
  - spec 08 §5.4–5.5;
  - START_HERE §2–4; `AGENTS.md`; `CLAUDE.md`; `.gitignore`.
- **P-33** Docs link test accepts folders and skips the OpenAI report until it's committed (adapted to P-32): spec 08 §8.4 and Decisions.
- **P-34** Part B skill files already exist; checked, not rewritten: spec 08 §2.
- **P-35** PowerShell runs the commands as written; always pass `--provider=offline`; tests never load `.env`: START_HERE §2; spec 01 §11; spec 05 §3.

## To record during the build

- **Identity hash (P-8, P-9):** *Reproduced at milestone 2.*
  - `npm run generate -- --provider=offline` writes `data/offline/catalogue.raw.json` hashing to `5caf2bbb0f343546` (108 games / 113 records), with `JSON.stringify(value, null, 2) + "\n"` and offline output left unsanitised.
  - At milestone 1 a scratch preview (A8 inlined) had predicted it. Without the trailing newline the feed hashes to `1baf4dc82cd66d8e`; compact JSON gives `9eaf122e9a164317`; the M1 feed alone (100 / 105) gives `4de3ec42e6087043`.
  - Still to confirm: the same value in `artifacts/offline/index.json` at milestone 5.
- **Theme-precision denominator (P-23):** whether including title-only records gives 0.667. *Pending milestone 6.*
- **Ranking numbers (P-16):** the served numbers are no longer a reproduction target; see "Baselines superseded" below. *At milestone 6, record this build's first offline values for them.*

## Baselines superseded

**What changed:** the prototype's recommender deduplicated only on title + studio. This build also skips a candidate with the same displayed name as the seed or an already-shown game (spec 02 §6.2, `quality:duplicate_title`), in both builds, so it serves different rails from the same catalogue. The offline catalogue has 5 groups of same-title games from different studios, two of them inside `live_game_show` ("Prize Wheel Live" ×3, "Big Show Live" ×3). Those are exactly the games the new rule now keeps apart.

**The test for each number:** does it go through `recommend()`? The title rule lives only there, in the quality step. Anything computed upstream of it, on the dataset, the enriched records or the precomputed neighbour lists, can't see it.

**Re-baselined: what the recommender serves.** These are prototype numbers, superseded by this build's first offline evaluation at milestone 6 (`npm run eval -- --provider=offline`). Record the new values here, then update START_HERE §3 to quote them with this reason.

| Metric | Prototype value | Why it moves |
| --- | --- | --- |
| Served Recall@5 (clusters) | 0.863 → 0.850 | Computed on `recommend()`'s output (spec 03 §7). The `live_game_show` members and near-misses that share a name with one another now dedupe, so fewer fellow members can be served |
| nDCG@5 | 0.549 | Computed on the items `recommend()` returns, against an ideal pool that still counts same-title games separately (spec 06 §5.2) |
| Lift over raw text | −0.026 | The difference between two nDCG@5 values, both served. The rule affects the `enriched` and `raw_text` variants differently, depending on which same-title games each ranks highly |
| Bad-recommendation rate | 0.606 | The share of grade-0 items among those shown. Removing a same-title item lets the next candidate in, with its own grade |
| Coverage | 0.979 | Whether `recommend()` answers at all. A rail that loses same-title items can fall below `minResults` and decline |

**Kept as expected values: what the title rule can't touch.** These are still the targets for this build.

| Value | Expected | Why it stays |
| --- | --- | --- |
| Cluster Recall@5 | 0.825 → 0.800 | Computed on the similarity ranking itself, the precomputed neighbour list before any rule (spec 03 §7). The neighbour lists come from the dataset, the rules enricher and the hashing embedder, all unchanged |
| Cluster MRR | 1 → 1 | Same: the rank of the first fellow member in the neighbour list, before any rule |
| Near-miss intrusion | 0.15 → 0 | Same: near-miss and member ranks in the neighbour list, before any rule |
| Theme precision when filled | 0.667 | An enrichment metric: enriched themes compared with the canonical record (spec 06 §4). Enrichment runs at build time and never calls `recommend()` |
| Game-type accuracy when filled | 1.0 | Same: enriched game type against the canonical record, at build time |
| `catalogueHash` | `5caf2bbb0f343546` | The dataset is untouched and still byte-identical to the prototype's |
| Planted traps | 39 rows, all handled | The rows come from the dataset. Their pass conditions are normalisation, enrichment, eligibility and policy outcomes, and a trap judged on being absent stays absent when a stricter dedupe removes more |
| `eligibilityViolations`, `duplicateViolations`, `policyViolations` | 0 | A stricter dedupe only removes items from a rail; it can never add one that violates a rule |

**Caveat on "kept":** these stay expected only while the rules enricher, the embedding text and the hashing embedder copy appendix A9, A16 and A17 exactly. If one of them differs at milestone 5 or 6, that's a rebuild discrepancy to investigate, not something the title rule explains.

## Known limitations

Kept on purpose, with reasons. They belong in the README's "what I left out" and in `docs/EVALUATION.md`'s known limitations when spec 08 writes them.

- **The real-name deny-list isn't exhaustive** (`src/catalogue/real-names.ts`).
  - It lists well-known names a casino-themed model is likely to reach for, so an obscure real title, or a real name not on the list, gets through. "Gods of Olympus" (in both OpenAI builds) isn't listed, because it couldn't be confirmed as a real title.
  - It also deliberately leaves out ordinary words that real titles happen to use ("gladiator", "the chase", "fortune", "royale", "gold rush"), because blocking them would reject invented titles.
  - So it's a backstop to reviewing a build's titles, not a replacement. A model-based "is this real?" check was rejected: it costs calls, and isn't reliable on obscure titles either. Add a name to the list when an inspection finds one.
- **Supplier-feed mess left in the OpenAI catalogue** (inspection notes, 2026-11-16 re-inspections):
  - card games and game shows on "single-zero wheel" layouts (4 card games; 2 `live_game_show` members);
  - table copy that still says "live dealer" after the mechanic was removed (4 tables);
  - metadata that contradicts its own copy;
  - games left with no mechanics (6).

  **Why kept:** this is what real supplier and CMS feeds look like, and the pipeline (normalisation, the evidence check, guarded enrichment) and the evaluation (wrong-fill samples, silver labels against the clean truth) exist to handle it. Tidying it at generation would make the dataset less representative, and the evaluation would measure a cleaner world than production.

  **Cost:**
  - wheel layouts pull card games and game-show members towards roulette in the embedding text;
  - enrichment will re-infer `live_dealer` on those tables from their copy, scored as wrong fills;
  - empty-mechanics records go to the LLM rather than being "complete" evidence.

  Expect all of it in spec 06's wrong-fills sample and failure cases.
- **One misleading-title trap is vacuous in the OpenAI build.**
  - g-019 came back as "Mega Scratch: Fruity Adventure". The model put the true type ("Scratch") in the title, and neither "Megaways" nor "Spins".
  - Its trap row (spec 02 §7: `e.gameType === truth.gameType`) will pass without testing whether enrichment trusts copy over a slot-sounding title. g-057 "Festive Spins Extravaganza" still tests it.
  - **`EVALUATION.md` must disclose** that the OpenAI report's 39/39 planted traps includes one row that proves nothing, and name it. It's kept rather than regenerated because nothing in the spec checks a misleading title's shape, and adding one is a generator change for later.
  - The offline build's misleading titles ("… Megaways") are unaffected.
- **Near-duplicate titles pass the display-title dedupe.**
  - The rail's dedupe (spec 02 §6.2) compares normalised titles exactly, so near-namesakes can share a rail: "Mystic Forest Quest" and "Mystical Forest Quest"; "Fruit Frenzy Megaways" and "Fruity Megaways Frenzy"; three "Fortune Wheel" names in `live_game_show`. The cluster-title repair can produce one too, since it also uses exact matching.
  - Fuzzy matching (word overlap, stemming, edit distance) is out of scope: it needs a threshold of its own, and a false positive would silently hide a legitimately different game.

- **Win-promise copy is left in the generated descriptions.** 8 of 108 descriptions in the first OpenAI build use language like "massive wins", "chance to win big" or "guarantees fun".
  - It's realistic supplier copy, and the system is built to handle it: descriptions are never shown to players (only titles are; AGENTS.md rule 4), and the guard discards any enrichment summary that echoes banned language (spec 04 §6). So it exercises the guard rather than threatening players.
  - Cleaning it at generation would remove a realistic input the guard should be tested against.
  - Cost: those records may embed with an empty summary.
- **Some games' metadata contradicts their own copy.** In the first OpenAI build: g-003's copy and layout say "cluster pays" but its mechanics don't; g-042 mentions cascading reels and a jackpot; g-098 and its escalation twin g-104 have "Jackpot" in the title; g-064 and g-082 have no mechanics.
  - The canonical record is the truth for the evaluation, so an enricher that correctly reads the copy is scored *wrong* on these. They'll appear in spec 06's "wrong fills", and slightly skew the silver relevance labels for these games.
  - Left as is because the canonical metadata is what the slate and enforcement produced, and "correcting" it from the copy would make the model's prose the source of truth for labels.
  - Fixing it properly needs a copy-versus-metadata check at generation, which isn't specified.
- **The "wheel" and "jackpot" keyword mappings** (appendix A2 `TAG_SYNONYMS`, used by the A9 rules enricher: `wheel → wheel_bonus`, `jackpot → progressive_jackpot`).
  - The rules enricher reads the title, copy and layout, so every roulette game with a "single-zero wheel" layout or "wheel" in its copy gets `wheel_bonus`, and any title or copy saying "jackpot" gets `progressive_jackpot`.
  - The `wheel_bonus` tags pull roulette tables towards the `live_game_show` members, whose defining mechanic is `wheel_bonus`: a near-miss intrusion risk in the `rules_enriched` and offline numbers.
  - Kept because the mappings are part of the reference vocabulary and rules enricher that reproduce the offline dataset and numbers. The rules enricher is a deliberately simple baseline ("a known imprecision, left in rather than tuned", spec 04 §7).
  - Narrowing them (e.g. "bonus wheel" only; "jackpot" only with a network) is a vocabulary change with its own evaluation.

## Spec gaps found after planning

- **Cross-batch title collisions (spec 01 §6.2), found by the first OpenAI generation run.**
  - **What happened:** the run failed with `duplicate title and studio: "Bandit Ridge: Outlaw's Bounty" by Northlight Interactive (slots 30 and 45)`. The two slots are members of the same series, so they share a studio after alignment. Batches of 10 can't see each other's titles, so a rerun can collide again.
  - **The gap:** the spec only said "fail on a repeat", which suits the deterministic offline generator but not a real model.
  - **Fix, in `src/catalogue/creative.ts`:**
    - After all batches, and after series alignment and cluster enforcement (which settle each studio), `generateWithLlm` finds title+studio collisions.
    - It regenerates each later slot with a single-slot call: the slot's line plus `Titles already used (do not reuse): …` listing every current title (JSON-quoted, comma-separated). `prompts/generate-catalogue.v2.md` is unchanged.
    - It re-runs the same repair steps (Zod, clamps, alignment, enforcement), up to 3 attempts per slot, where a failed call counts as one. Then it fails with the existing message naming the slots, plus `(not repaired after 3 attempts…)`.
  - **Visible in the manifest:** first recorded as `manifest.titleRepairs`; now an entry of kind `title_studio` in `manifest.repairs` (see the next entry). LLM path only; `[]` when nothing needed fixing.
  - **Offline:** unchanged; `catalogueHash` is still `5caf2bbb0f343546`.
  - **Spec:** spec 01 §6.2 and its Decisions table updated to match.
  - **Tests:** in `tests/pipeline.test.ts`, under "repairs after LLM generation".
  - **Verified:** the OpenAI rerun succeeded with one title repair (slot 32), before the next entry's changes.

- **Fixes from the OpenAI catalogue inspection** (`docs/notes/openai-catalogue-inspection.md`), specified first, then built.
  1. **Repeated titles inside the benchmark clusters** are a collision whatever the studio, repaired by the same loop (kind `cluster_title`). The reason: titles go into the embedding text, and two cluster games with one title distort cluster recall. A cluster game sharing a title with a *non*-cluster game is left alone, because the rule is scoped to cluster games. Spec 01 §6.2 and Decisions; `src/catalogue/repairs.ts` (`findClusterTitleCollisions`).
  2. **`live_dealer` on non-live games** is removed in code after the repair loop, without a model call, and recorded as `live_dealer_removed`. Spec 01 §6.2 and Decisions.
  3. **Layout fit** (`layoutFit` in `repairs.ts`, rules in spec 01 §6.2):
     - a contradiction goes back to the model, with the bad layout named in the request (`layout_regenerated`);
     - a missing or placeholder layout on a non-slot becomes `null` (`layout_cleared`, no call).

     Interpretations:
     - A slot layout must have a grid **and** win lines, ways, Megaways or a cluster grid, so "6x5, cascading" counts as a contradiction. That follows the prompt's "include the win lines or ways for slots".
     - A missing slot layout is regenerated too.
     - The placeholder test is "matches nothing a layout for that type looks like" (a wheel, shoe, deck or table; a scratch grid; balls). So "live wheel" is kept, while "live dealer", "live_dealer" and "live studio setting" are cleared.
     - Card games on a "single-zero wheel" are still accepted: the rule only knows types, not themes.

     Knock-on changes:
     - `CanonicalGame.reelLayout` and `CreativeGame.reelLayout` are now nullable (spec 01 §5.1; appendix A12).
     - `specsFor` leaves a null layout out of the feed. The layout key is still drawn, so offline draws and key order are unchanged (appendix A7; spec 01 §7.2). Offline `catalogueHash` re-checked: still `5caf2bbb0f343546`.
  - **The manifest record** is now one `repairs` list (`{ kind, slot, field, before, after, attempts }`, plus `collidedWithSlot` and `provider` for title kinds), replacing `titleRepairs`. Every regeneration request now lists the *other* slots' titles, so a layout repair can't create a title collision.
  - **Loop and code layout:** problem detection and the deterministic fixes live in the new `src/catalogue/repairs.ts`; the regeneration loop (`repairSlot`) stays in `creative.ts`. A slot is accepted when it has no remaining problem on either side of a collision, so the loop always ends.
  4. **Same displayed name in a rail** (spec 02 §6.2 and Decisions; spec 06 §5.2).
     - `recommend()` also skips a candidate whose normalised title (lowercased, letters and digits only) matches the seed's or an accepted item's, counted as `quality:duplicate_title`.
     - **Interpretation of "add the normalised title to the dedupe key":** the `dedupeKey` field itself is unchanged (title-without-RTP + studio, used for same-game detection and the evaluation's duplicate checks). The rail dedupes on it *and* on the display title. A same-game duplicate counts only as `duplicate_or_rtp_variant`.
     - Tests in `tests/recommender.test.ts` ("never shows two games with the same displayed name…").

  **Not verified yet:** the OpenAI regeneration with fixes 1–3.

  **Decision (2026-11-16): the display-title dedupe is a service rule for both builds.** It isn't scoped to the OpenAI build: players see titles whichever build is served, so the offline build is held to the same rule. See "Baselines superseded" (above) for what this does to START_HERE §3.

- **Real-world names in generated titles (spec 01 §4 hard rule, §6.2), found by re-inspecting the 02:06 rebuild.**
  - **What happened:** the rebuild had "Wheel of Fortune Live" (a `live_game_show` member), "Casino Royale Live" and the borderline "Candyland Delight". The prompt forbids real names, but nothing in code enforced it.
  - **Fix:**
    - a new module, `src/catalogue/real-names.ts`, holds a deny-list of real brands, operators, studios, game franchises, casino games, game shows, films, TV shows and board games, matched case- and punctuation-insensitively on whole tokens;
    - in the repair loop, a matching title is a `real_name` problem. The slot is regenerated with `The previous title "…" uses a real-world name ("…"). Use an invented title: no real brand, game, franchise, film or TV title.`, up to 3 attempts, then the run fails naming the slot;
    - the check also applies to titles produced by other repairs;
    - recorded in the manifest as `real_name`, with the matched `realNames`.
  - **Spec:** spec 01 §6.2 and Decisions. **Tests:** `tests/real-names.test.ts` (the matcher, including names it deliberately lets through) and `tests/pipeline.test.ts` ("real-world names in titles").
  - **On the 02:06 build:** it catches 3 of 108 titles, g-007 "Wheel of Fortune Live", g-038 "Candyland Delight" and g-054 "Casino Royale Live". It catches nothing in the offline titles. Offline `catalogueHash` unchanged (`5caf2bbb0f343546`). The OpenAI rerun is still to do.

## Build choices where the specs are silent

*(Add one line per choice as milestones are implemented.)*

### Milestone 1 (spec 01)

- **Shared pipeline module.** `src/catalogue/dataset.ts` (`generateDataset`) runs slate → creative → `assembleCanonical` → `degrade` and builds the manifest in memory. The generate script only writes its result, so tests exercise exactly the code the script runs.
- **Path API in `src/config.ts`.** `dataPaths(mode)` returns the raw feed and manifest; `evaluationLabelPaths(mode)` returns the canonical and reference files. Keeping the labels behind their own function gives spec 05's boundary test one name to forbid.
- **Canonical validation.** `CanonicalGameSchema.array().parse()` runs on the assembled catalogue, but its output is discarded: Zod returns keys in schema order, and the files must keep appendix A6's key order.
- **LLM batch matching.** Each returned game is matched to its slate entry by `slot`, so the order in the response doesn't matter. A wrong count, a missing slot or a Zod failure fails the attempt; after 3 attempts (backoff with jitter) the run fails. Clamps run per entry, then `alignSeries`, then `enforceSlate`.
- **Generation request.** The user message is one intro line ("Create one game for each slate entry below, in the same order, echoing each slot number.") followed by the spec 01 §6.2 slate lines. A cluster entry with no extra themes says `also themes=none`.
- **Title + studio uniqueness key.** The title lowercased with non-alphanumerics removed, plus the exact studio. The reference offline data passes it.
- **Manifest.** `provider`, `model`, `promptVersion` (null offline), an offline `note`, `seeds`, `generatedAt`, `counts` and a full `evaluation_dimensions` (spec 03 §6 shape: denominators, per-game and per-record counts, the four clusters). Built now because spec 01 §9 asks for it; milestone 3 verifies it.
- **`resolveProviderMode`** returns `{ mode, reason }`; the generate script logs both (spec 05 §3).
- **Extra test files.** `tests/misc.test.ts` (PRNG, serialisation, atomic writes, retry jitter, `mapLimit`) and `tests/providers.test.ts` (provider-mode resolution), beyond the two files spec 01 names.
- **Toolchain.** Node v26.13.1 with ICU 78.3 (`toLocaleString("en-GB")` gives `5,000`). tsx 4.19.2 prints a harmless `DEP0205 module.register()` deprecation warning on Node 26. Nothing needed changing.

### Milestone 2 (spec 02)

- **Festive anchors kept.** `addTrapGames` is A8 verbatim, so festive games stay in the anchor pool (spec 02 §4.1 allows excluding them; doing so would change the dataset). The reference draws give 4 seasonal records.
- **Trap games in the pipeline.** `generateDataset` runs `addTrapGames(…, 777)` between `assembleCanonical` and `degrade`, passing `specials`, `anchors` and `anchorOf` as `forcedSpecials`, `anchors` and `anchorOf`. The generate script itself is unchanged.
- **`recommend()` signature.** `recommend(index, config, request)`.
  - `index` is a `RecommendIndex` (the `games`, `neighbours` and `embedding` of the artefact), so the evaluation can swap in other neighbour lists.
  - The result is `{ status, reason?, seed, items: [{ gameId, title, score }], diagnostics }`. The HTTP layer (spec 05) shapes the response from it and strips the diagnostics.
- **`month`** defaults to the current UTC month inside `recommend()` as well as in the server.
- **Limit clamping** truncates a non-integer limit before clamping to 1…`maxLimit`; a missing limit becomes `defaultLimit`.
- **A neighbour id missing from `games`** is skipped and counted as `quality:not_in_index`. A validated index can't contain one; this fails closed anyway.
- **Neighbours below the threshold** end the loop without a diagnostic: they're not candidates.
- **No threshold for the index's embedder** makes `recommend()` throw. `loadIndex` (spec 05) refuses such an index first, so this only signals a programming error.
- **`DECLINE_REASONS`** is exported alongside the `DeclineReason` type, so tests (and spec 08's docs test) can check every reason is covered.
- **`ServiceConfigSchema`** is strict (unknown keys rejected). Brand keys must be in `KNOWN_BRANDS`, and `defaultLimit` must not exceed `maxLimit`. Its path is `SERVICE_CONFIG_PATH` in `src/config.ts`.
- **`IndexSchema` written now.** It lives in `src/domain/index-schema.ts` with `ServiceGame`, with the spec 05 §4.3 fields; its type is named `RecommendationIndex` (the name appendix A14 uses). Spec 05 builds the artefact against it.
- **`eval/release-gates.json` shape.** A `_comment`, then layer → gate key → `{ min | max, why }`. Spec 06 adds its gates to the same groups.
- **Extra test file.** `tests/config.test.ts` checks the service config against spec 02 §6.1 and the gates file's structure.

### Milestone 3 (spec 03)

- **No code change needed.** The cluster definitions (A3), enforcement (A4), availability (A6), profiles and labels (A7), and the manifest's `evaluation_dimensions` (built in `src/catalogue/dataset.ts` since milestone 1) already implemented spec 03. This milestone added the tests and the README section.
- **"Near-misses differ in type or mechanics"** is tested as: a different game type, or a mechanics list not identical to the members'. Every reference near-miss meets it. Near-misses also get the £0.20/£50 stakes, because `enforceSlate` applies to every forced entry, not only members.
- **"Allowed volatility"** for members means the cluster's listed values. The fishing members alternate medium/high by slate order (`i % 2`), giving 3 medium and 2 high.
- **`marketProfile`, `brandScope` and `distribution` per canonical game** are counted from each game's own reference entry (`rawId === canonicalId`), not from duplicates or RTP variants. They come from the canonical record, so a record whose feed lost its markets still counts as `eu_only`/`eu_and_nj` here; the missing markets show up in `trapTypes` instead.
- **README "Dataset design"** gives label values and denominators, not counts per value, so it stays true for both the offline and the OpenAI build. The counts live in each build's manifest. The rest of the README is left to spec 08.
