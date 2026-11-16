# Spec 01: the synthetic catalogue

> **How to use this spec.** Give it to an engineer or a coding agent together with [`AGENTS.md`](../../AGENTS.md):
> `Read @AGENTS.md and implement @docs/prompts/01-dataset-spec.md`.
> It covers the base dataset. **The full dataset also needs specs 02 (guardrail traps) and 03 (benchmark clusters)**, which build on this one.
> Where this spec and `AGENTS.md` disagree, `AGENTS.md` wins. Flag the conflict rather than guessing.

## 1. Goal

Generate a **fictional** catalogue of about 100 online casino games, using an LLM, that looks like a real supplier/CMS feed: uneven, inconsistent, partly missing, occasionally hostile.

Every later stage (enrichment, matching, eligibility, evaluation) depends on this data having real signal. A uniformly clean catalogue would not exercise any of them.

Commit the script and the OpenAI-generated data (`data/generated/`). The offline stand-in (section 6.4) writes to `data/offline/`, which is git-ignored and never committed.

## 2. Context you need

- The product is a "Because you played [Game X], you might like…" rail on a **regulated, real-money** casino site, with several brands and markets.
- Two games are "similar" mainly because of **game type, theme, mechanics and volatility**, not theme alone. A player who likes a gentle low-volatility classic slot may dislike an extreme-volatility game with the same theme.
- Some fields are **authoritative**: certified game maths, licences, operational status. They must only ever come from source data. The dataset must make it possible to test that nothing downstream invents them.

## 3. Deliverables

| Path | What |
| --- | --- |
| `src/util/misc.ts` | PRNG and sampling ([appendix A1](appendix-reference-values.md#a1-prng-and-sampling)), `round`, `sha256`, `stableStringify` (section 10), `mapLimit`, plus `withRetry` (with jitter) and `writeFileAtomic`, written now to their final contracts in spec 07 §3.2 |
| `src/config.ts` | `KNOWN_BRANDS`, `EU_BRANDS` ([appendix A15](appendix-reference-values.md#a15-brands-and-helpers)) and the data and artefact path constants for both builds. The only file in `src/` that may name the evaluation files |
| `src/ai/providers.ts` | The `JsonLlm` interface and `OpenAiJsonLlm` (contract in spec 04 §3), and `resolveProviderMode` (spec 05 §3). Generation needs them, so they're built here; specs 04 and 05 add to this file |
| `src/domain/vocabulary.ts` | Closed vocabularies and fictional names (section 4) |
| `src/domain/types.ts` | `CanonicalGameSchema` (Zod), `RawRecord`, `NormalisedGame` (section 5; exact definitions in [appendix A12](appendix-reference-values.md#a12-domain-types)) |
| `src/catalogue/slate.ts` | Seeded slate that fixes the catalogue's shape (section 6.1) |
| `src/catalogue/creative.ts` | LLM generation plus a deterministic offline stand-in (section 6.2) |
| `src/catalogue/degrade.ts` | Seeded clean → messy degradation and reference data (section 7) |
| `src/pipeline/normalise.ts` | The only code that reads raw records (section 8) |
| `scripts/generate-catalogue.ts` | CLI: `npm run generate -- --provider=openai\|offline` |
| `prompts/generate-catalogue.v2.md` | **Given:** already in the repo. Use it as is. The runtime prompt, versioned in its filename |
| `<data>/catalogue.raw.json` | The messy feed. **The only file the pipeline reads** |
| `<data>/catalogue.canonical.json` | The clean truth. **Evaluation only** |
| `<data>/eval-reference.json` | What was done to each raw record (section 9). **Evaluation only** |
| `<data>/manifest.json` | Provider, model, prompt version, seed, counts, dataset summary |
| `.gitattributes` | `* text=auto eol=lf`, so a checkout never rewrites the line endings of a hashed file (section 10) |
| `tests/normalise.test.ts`, `tests/pipeline.test.ts` | Section 12 |

`<data>` is `data/generated/` for `--provider=openai` (committed) and `data/offline/` for `--provider=offline` (git-ignored).

## 4. Vocabulary (closed lists)

Every tag used anywhere must come from these lists. That's what makes hallucinated tags detectable and enrichment measurable.

**The exact lists, names and synonyms are in [appendix A2](appendix-reference-values.md#a2-closed-vocabularies-and-tag-synonyms); use them verbatim.** The bullets below summarise them. `fishing` and `cash_collect` are already part of this vocabulary (spec 03 relies on them).

- **Game types:** `slot`, `table`, `live`, `instant_win`, `bingo`.
- **Volatility:** `low`, `medium`, `high`, `extreme`, with an ordinal rank of 0–3.
- **Themes:** about 25, e.g. `egyptian`, `mythology`, `adventure`, `fruit`, `classic`, `animals`, `fantasy`, `horror`, `irish`, `asian`, `sports`, `music`, `space`, `pirates`, `western`, `gems`, `candy`, `underwater`, `festive`, `wealth`, `nordic`, `aztec`, `cards`, `roulette`, `game_show`, `fishing`.
- **Mechanics:** about 17, e.g. `megaways`, `cluster_pays`, `hold_and_win`, `free_spins`, `cascading_reels`, `progressive_jackpot`, `expanding_wilds`, `multipliers`, `pick_bonus`, `sticky_wilds`, `live_dealer`, `side_bets`, `fixed_paylines`, `scratch_card`, `wheel_bonus`, `bonus_buy`, `cash_collect`.
- **Markets:** `GB`, `ES`, `SE`, `NL` (European licences) and `NJ` (a US state licence served by its own brand).
- **Brands (fictional):** `aurora`, `harbour`, `meridian` (European) and `liberty` (NJ only).
- **Studios (fictional):** 6, e.g. "Lumen Studios", "Kestrel Play". **Aggregators (fictional):** 2, e.g. "Nexus Distribution". **Jackpot networks (fictional):** 3, e.g. "Crown Jackpots".
- **Tag synonyms:** a map from the spellings suppliers use to vocabulary terms. For example "Ancient Egypt" → `egyptian`, "Hold & Win" → `hold_and_win`, "Tumbling Reels" → `cascading_reels`, "Feature Buy" → `bonus_buy`, "Vikings" → `nordic`.

**Hard rule:** no real game titles, studios, aggregators, operator brands or jackpot networks, anywhere.

## 5. Data model

### 5.1 Canonical game (clean truth; Zod-validated)

```ts
{
  id: "g-001",
  title: string,
  provider: Studio,              // the studio that built it: identifies the game
  aggregator: Aggregator | null, // who distributes it, if anyone
  gameType, themes: Theme[] (≥1, primary first), mechanics: Mechanic[], volatility,
  rtp: number,                   // 94.0–97.5          authoritative
  minStake: number,              // authoritative; generated games clamped to £0.10–£1.00 (appendix A4)
  maxStake: number,              // authoritative; generated games clamped to £2–£100. Trap twins (spec 02) are set to
                                 // £2 / £500 after clamping, so the schema itself has no range: just positive numbers
  maxWinMultiplier: number,      // 50–50,000 for LLM output (clamped); offline output isn't clamped (6.4). Authoritative
  reelLayout: string | null,     // "5x3, 20 lines", "6x7 Megaways, 117,649 ways", "single-zero wheel", "90-ball";
                                 // null only for a non-slot whose LLM layout was a placeholder (§6.2 repairs)
  jackpotNetwork: JackpotNetwork | null,   // only if mechanics include progressive_jackpot
  releaseYear: number,           // 2012–2026
  description: string,           // 1–4 sentences, supplier style, accurate, no win claims
  seriesId: string | null,       // sequels/variants share one
  brands: Brand[], markets: Market[],
  status: "active" | "withdrawn" | "suspended" | "certification_expired" | "demo_only",
  isTestGame: boolean,
  seasonMonths: number[] | null  // e.g. [11, 12, 1] for festive titles
}
```

### 5.2 Raw feed record (before validation)

An interface where **every field is optional and typed `unknown`**, plus an index signature, because suppliers add fields without notice. Document the shapes actually emitted in a comment next to each field. Field names follow a CMS export, not the canonical model:

`game_id, name, studio, aggregator, category, tags, volatility, description, rtp, max_bet, min_bet, release, franchise, specs | reel_layout | max_win_multiplier | jackpot_network, brands, markets, status, is_test_game, available_months, last_updated`

### 5.3 Normalised game

The typed output of `normaliseRecord(raw)`. Every field from 5.1 that the record supports, nullable where it can be missing, plus:
- `dedupeKey`
- `unknownTags[]`
- `issues[]` (data-quality findings)
- `sourceHash` (SHA-256 of the stable-stringified raw record, used for caching)

## 6. Stage 1: the clean truth

### 6.1 Slate (seeded, no model involved)

Build a list of exactly 100 entries **before** calling any model (seed 42). Each entry has a slot number, game type, primary theme, series name or null, and flags. Target mix:
- 70 slots, 9 table, 9 live, 7 instant win, 5 bingo;
- 8 series of 2–3 slots each (20 entries), sharing a theme;
- 2 instant-win entries flagged `misleadingTitle`;
- 28 entries reserved for the benchmark clusters in spec 03 (included in the counts above).

Spec 02 later adds 8 trap games derived from real ones, giving **108 canonical games** (78 slots). With the duplicate exports and RTP variants from section 7.3, that becomes **113 feed records**.

Shuffle with the seed, so series members land in different generation batches. Slot numbers (and so game ids, `g-001`…`g-100`) are assigned **after** the shuffle.

Exact values ([appendix A3](appendix-reference-values.md#a3-slate-series-theme-pools-fixed-mix-draw-order)):
- **Series sizes:** 3, 2, 3, 2, 3, 2, 3, 2, in the order listed there.
- **Fixed non-slot mix:** table 9, live 2, instant win 5 and bingo 4, plus the cluster entries. Each has its own theme pool.
- **Remaining slots:** drawn from `SLOT_THEMES`.
- **Festive games:** chance alone gives about 2–4, so the trap table's "~4–5 seasonal titles" is approximate.

### 6.2 Creative generation (LLM)

- Batches of 10 slate entries per call, at **temperature 0.7**.
- **Structured output:** send a strict JSON schema (`additionalProperties: false`, every field required, enums for provider, themes, mechanics, volatility and jackpot network). Then **also validate the response with Zod**. Provider-side schemas are not the contract; ours is.
- The prompt (versioned file) must say:
  - invent everything; no real titles, studios, brands or networks;
  - one game per slate entry, in order, echoing the slot number;
  - use the slate's game type and include its primary theme;
  - series members get related titles ("X", "X Deluxe"), overlapping themes and mechanics;
  - a `misleadingTitle` entry gets a slot-sounding title ("… Megaways") but an accurate description of its real type;
  - descriptions are 1–4 sentences, accurate, with no promises of winning;
  - the reel layout must match the type and mechanics, and include win lines or ways for slots;
  - a jackpot network appears only with `progressive_jackpot`;
  - `extreme` volatility and `bonus_buy` are rare (at most 1 in 10 games).
- **The request.**
  - The system prompt is the versioned file.
  - The user message lists the batch's slate entries, one line each:
    `#<slot> type=<gameType>; primary theme=<theme>; series=<name|none>`, then `; misleading title` when flagged, then `; MUST use mechanics=<a,b>; volatility=<v>; also themes=<x,y>` for a cluster entry (spec 03 §4).
  - The response is `{ games: CreativeGame[] }`.
  - `CreativeGame` = `{ slot, title, provider, themes, mechanics, volatility, rtp, minStake, maxStake, reelLayout, maxWinMultiplier, jackpotNetwork, releaseYear, description }`: the fields appendix A4 and A5 use.
- **After the response, clamp and enforce in code; never trust the model for invariants.** The order is: Zod parse → `sanitiseCreative` per entry → `alignSeries` → `enforceSlate` ([appendix A4](appendix-reference-values.md#a4-slate-enforcement-and-creative-clamps)).
  - primary theme first; at most 4 themes and 5 mechanics, de-duplicated;
  - RTP, stakes, max win and year clamped to the ranges in 5.1;
  - jackpot network set to null unless the game is progressive;
  - all series members share the studio of whichever member comes first **in slate order**.
- Retry a failed batch with backoff (3 attempts). Never silently drop a slate entry: if a batch still fails, or returns the wrong number of games, **fail the run**.
- **Title and studio together must be unique.** Two unrelated games with the same title and studio would share a dedupe key and be merged. The same title from different studios is allowed (the offline generator produces a few). The generate script fails on any repeat that reaches it.
- **Repairs after generation (LLM path only).** Batches can't see each other, and a model doesn't always follow the layout rules, so after all batches, and after series alignment and cluster enforcement (which settle each game's studio), the output is checked and repaired. The offline generator gets none of this, so its output, and the reference dataset, are unchanged.
  - **What is regenerated.** Each slot with one of these problems is regenerated alone:
    - **Title and studio repeat an earlier slot's.** The later slot is regenerated.
    - **A title repeated among benchmark-cluster games**, whatever the studio. The later slot is regenerated. Titles go into the embedding text, so two cluster games with one title would distort cluster recall.
    - **A title that uses a real-world name.** §4's hard rule says no real titles, studios, brands or networks. The prompt says so too, but a model can still produce one ("Wheel of Fortune Live", "Casino Royale Live" in the first rebuild). A title is checked against a deny-list of known real brands, operators, studios, game franchises, casino games, game shows, films and TV titles (`src/catalogue/real-names.ts`).
      - **Matching:** case- and punctuation-insensitive, on whole tokens. "Casino-Royale!" matches "casino royale"; "Monopolyx" doesn't match "monopoly". Both spellings are listed where a name is commonly written as one word or two ("candy land", "candyland").
      - **The request** adds: `The previous title "…" uses a real-world name ("…"). Use an invented title: no real brand, game, franchise, film or TV title.`
      - **The list isn't exhaustive.** It catches the known and the likely, and a name missing from it gets through. Reviewing the titles is still part of inspecting a build.
    - **A layout that contradicts the game type**, or is missing on a slot. On a non-slot, reels, lines, paylines, ways, Megaways or a cluster grid contradict the type (a scratch grid like "3x3 scratch grid" is fine on an instant win). On a slot, the layout must give a grid (`5x3`) **and** win lines or ways, Megaways or a cluster grid, because §6.2's prompt requires them.
  - **The single-slot request.** The slot's line, plus `Titles already used (do not reuse): …` listing every current title (so a repair can't create a new collision), plus, for a layout problem, `The previous reelLayout "…" does not fit type=<type>. Use a reelLayout that fits it.` The versioned prompt file is unchanged.
  - **Accepting a repair.** The result goes through the same clamps, alignment and enforcement, and is kept once the slot has none of these problems. Up to 3 attempts per slot (a failed call counts as one); if it still has a problem, the run fails with a message naming the slot(s).
  - **Deterministic fixes**, after the regeneration loop:
    - `live_dealer` is removed from any game whose type isn't `live`. A live dealer is a property of live games only, and on a table or bingo game it blurs table against live in matching.
    - A missing or placeholder layout on a non-slot becomes `null`. Placeholders are anything that doesn't describe a board for that type, such as "live dealer" or "live studio setting". The fits are a wheel, shoe, deck or table for table and live games; a scratch grid, tiles or panel for instant win; balls for bingo. A null layout is omitted from the feed (§7.2 `specs`), and normalises to `reelLayout: null`.
  - **The record.** Every repair is recorded in the manifest's `repairs` list: `{ kind, slot, field, before, after, attempts }`. The `kind` is `title_studio`, `cluster_title`, `real_name`, `layout_regenerated`, `layout_cleared` or `live_dealer_removed`. Collision repairs also give `collidedWithSlot` and `provider`, a `real_name` repair gives the `realNames` it matched, and deterministic fixes have `attempts: 0`.

### 6.3 Operational fields (seeded code, never the LLM)

Brands, markets, status, aggregator, test flag and season come from contracts and compliance, not creative copy. Assign them with a seeded PRNG (seed 99):
- **Brands:** about 15% single-brand exclusives, about 40% on two EU brands, the rest on all three.
- **Markets:** about 75% in all EU markets, otherwise 2–3 of them, with GB usually included.
- **NJ:** about 30% also on `liberty` + NJ; about 5% NJ-only.
- **Status:** about 5% withdrawn.
- **Aggregator:** about 60% distributed by one.
- **Season:** `festive` games get `seasonMonths = [1, 11, 12]`.
- **Test flag:** no base game is a test build. The only test build is spec 02's trap.
- **Draws:** the 30% `liberty` and 5% NJ-only shares come from one draw (< 0.05 NJ-only, < 0.35 also NJ). Cluster games then get every EU brand and market (spec 03 §5).
- **Disabled brand:** `meridian` is disabled in the config, so its exclusives are never served. That's intended: it exercises `BRAND_DISABLED`.
- **Exact draw order:** [appendix A6](appendix-reference-values.md#a6-operational-fields).

### 6.4 Offline stand-in

A deterministic procedural generator (seed 7) that implements the same slate contract, using word lists and templated descriptions ([appendix A5](appendix-reference-values.md#a5-offline-stand-in-generator)). Its descriptions name the game type, volatility and mechanics in words the rules enricher recognises, so **offline enrichment scores are optimistic and mean little**. Only the LLM build measures enrichment. It exists so tests and CI run with **no API key and no network**.

Its output must say so in `manifest.json`. It is **not** the submitted dataset:
- it's written to `data/offline/` (git-ignored), never to `data/generated/`;
- it goes through `enforceSlate` only, not `sanitiseCreative` or `alignSeries` (appendix A4). Its values already sit in the generated ranges and its series already share a studio. The one exception is the `extreme` `classic_fruit` near-miss, whose max win can exceed 50,000 (up to 75,000). That's left as drawn, because clamping would change the reference dataset.

## 7. Stage 2: degradation (pure, seeded TypeScript)

`degrade(canonical, opts) → { raw, reference }` must be deterministic for a given seed (1234). The same input gives byte-identical output.

### 7.1 Quality profiles (per record)

| Profile | Share | What survives |
| --- | --- | --- |
| rich | ~45% | Every field except: volatility kept ~85% of the time, specs ~80%. Format noise applies |
| partial | ~33% | Category ~60%; tags (first 2 only) ~40%; volatility ~40%; first sentence of description; specs ~50% |
| thin | ~17% | Title, studio, operational fields; category ~40%; description present about half the time, and always truncated to its first 8 words when present |
| title_only | 5 records | Title and operational fields only; studio removed half the time |

How to read this table (the exact draws are in [appendix A7](appendix-reference-values.md#a7-degradation-constants-edge-case-picks-profiles-field-survival)):
- **The shares apply to unforced records only**, drawn in this order: r < 0.45 rich, r < 0.78 partial, else thin. Forced profiles come first: title-only and opaque picks → `title_only`; trap games and anchors → `rich`; cluster games → rich 60% / partial 40%; prompt-injection and noisy-tags picks → `rich`; marketing-fluff, cold-start and misleading-title picks → `partial`. Overall shares therefore land near, not on, 45/33/17.
- **"Tags (first 2 only)"** means the first 2 of the record's tag list, which is themes then mechanics in canonical order.
- **Stakes travel with every record except title-only** (rich, partial and thin alike), in one of three formats each. Brands, markets and status are on every record. RTP and release survive in about 80% of rich and partial records.
- **Title-only total: 8 records.** The 5 here plus the 3 opaque records spec 02 adds, which also get profile `title_only`.

### 7.2 Format noise (apply independently)

| Field | Variants to emit |
| --- | --- |
| `name` | as-is; `"  Title™ "`; UPPERCASE (in duplicate exports) |
| `studio` | as-is, UPPERCASE, lowercase, `"… Ltd"`, spaces removed |
| `aggregator` | as-is, UPPERCASE; missing ~30% of the time when there is one |
| `category` | "Video Slot", "VIDEO SLOTS", "Table Games", "Blackjack/Roulette", "Live Casino", "Scratchcards", "bingo rooms"… |
| `tags` | array, or a string joined by `;` `,` or `|`; synonym spellings ("Ancient Egypt", "Hold & Win") |
| `volatility` | "Med", "3/5", "HIGH", "4/5", "Very High", "EXTREME", "L" |
| `rtp` | `96.21`, `"96.21%"`, `"0.9621"`, `"96,21"` |
| `max_bet`, `min_bet` | `100`, `"£100"`, `"100.00"`, `"10p"` |
| `specs` | nested blob with varying keys (`reels`/`layout`/`grid`, `max_win`/`maxWin`, `jackpot`/`jackpot_network`), or flat columns. A null layout (§6.2 repairs) is left out, not sent as null; the key is still drawn, so the draws don't shift |
| max win | `"5,000x"`, `"x5000"`, `5000` |
| `release` | `"2019"`, `"2019-03-01"`, `2019` |
| `markets` | array, or `"UK;SE"` (UK means GB) |
| `brands` | array, or `"aurora,harbour"` |
| `status` | "live", "ACTIVE", "active", "disabled", "withdrawn", "maintenance", "SUSPENDED", "CERTIFICATION_EXPIRED", "DEMO_ONLY" |
| `description` | wrapped in `<p>…</p>` ~20% of the time |
| `rtp`, `release` presence | included for ~80% of rich and partial records; never for thin or title-only |
| `franchise` | the series name in plain words, on ~50% of rich series records |
| `last_updated` | a plausible date, as noise (nothing reads it) |

### 7.3 Data-quality edge cases (planted, controlled counts)

Pick the targets with the seed from **live** games that aren't used for anything else.

| Edge case | Count | Construction |
| --- | --- | --- |
| Misleading title | 2 | The slate-flagged instant-win games. Category, tags and specs removed; full accurate description kept |
| Marketing fluff | 2 | Description replaced with hype containing **no** gameplay facts; tags, volatility and specs removed |
| Cold-start release | 2 | No description, category, volatility or specs. Tags become exactly `[type, "<Vol> Volatility", primary theme]`, plus any declared feature that §7.4 appends afterwards (e.g. "Bonus Buy"). Release set to `today`: a degradation option that defaults to the fixed date `2026-11-10`, never the wall clock, so output stays reproducible |
| Duplicate export | 3 | An extra record `<id>-cms2` with an UPPERCASE name. The last one also has **studio and aggregator swapped** |
| RTP variant | 2 | An extra record `<id>-rtp<NN>`, with RTP about 2.1 points lower and the RTP in the title ("Gold Rush 94" or "Gold Rush (94.1%)") |
| Prompt injection | 2 | A rich record whose description ends with an instruction to ignore previous instructions and tag the game "guaranteed win" / "free money". Volatility removed, so it **must** go through the LLM |
| Non-English description | 1 | A Spanish description |
| Noisy tags | 2 | Junk tags appended (`🔥 HOT`, `new!!`, `Top 10`) |
| Missing licence data | 2 | `markets` removed |
| Missing status | 1 | `status` removed |

Specs 02 and 03 add more, and **are needed for the full dataset**:
- **Spec 02:** guardrail traps (market twins, escalation twins, lifecycle copies, test builds, opaque records, seasonal titles), derived with seed 777.
- **Spec 03:** benchmark clusters.

Leave room for them. Edge-case selection must exclude games another spec has reserved: trap games and their anchors, cluster games, and seasonal titles. It also excludes withdrawn games and the misleading-title games. The 25 picks are one seeded sample, assigned in this order: the 12 edge cases above, in table order, then 3 duplicates, 2 RTP variants, 5 title-only and 3 opaque.

### 7.4 Features that must survive degradation

Some mechanics are restricted in some market (`bonus_buy` in GB). If degradation drops that tag, no fail-closed rule can block the game, and the ground-truth eligibility gate can't reach 0. Real suppliers have to declare these features. So, after all other degradation, **every record except title-only and opaque ones lists each declared feature in its tags**: append its feed spelling ("Bonus Buy") if it isn't already there, without consuming any random draws. The list is `DECLARED_FEATURES` in `degrade.ts` (appendix A7). It's tested by giving every game a bonus buy and checking that every non-title-only record still normalises to `bonus_buy`. Title-only and opaque records never get recommended, because they're flagged insufficient.

## 8. Normalisation (the only reader of raw records)

Rules only, no model. Each parser is a pure, exported, tested function.

- **Title:** trim; strip HTML, `™®©` and extra spaces.
- **Studio/aggregator:** map spelling variants to canonical names, and treat "Unknown", "N/A" and "tbc" as missing. Repair the swap: if the studio field holds an aggregator and the aggregator field holds a studio, swap them back and record an issue. If the studio field holds only an aggregator, the studio is unknown.
- **Game type:** from `category`, or else from a coarse supplier tag ("Slots").
- **Volatility:** from the field, or else from a tag ("High Volatility"). "1/5"–"2/5" → low, "3/5" → medium, "4/5" → high, "5/5" / "Very High" / "EXTREME" → extreme.
- **Tags:** split on `; , |`; map through the synonyms; keep everything unrecognised in `unknownTags`.
- **Numbers:**
  - RTP: fractions ×100, comma decimals; outside 85–99.9 → null.
  - Stakes: `£`, `,` and `p` handled.
  - Max win: `x` and `,` stripped; implausible values → null.
  - Never guess a missing number.
- **Specs:** read nested or flat; canonicalise jackpot networks.
- **Eligibility fails closed:**
  - missing `markets` → available nowhere;
  - unknown brands are dropped;
  - only "live", "active" or "enabled" counts as live; every other status, including missing, is not live;
  - a test flag (`true`, or `y`, `yes`, `true` or `1` in any case), or a title matching `/^(test|qa|dev)[_\s-]/i`, marks a test build. This is the same rule as spec 02 §5.
- **Season:** absent `available_months` → `null` (all year). Present but unreadable (not a list, or no valid month 1–12) → `[]`, so the game is never in season, with issue `season_unreadable`. Fails closed, like markets and status.
- **Exact parsers** (tag splitting, vocabulary terms with spaces such as "scratch card", category and volatility tags, stake commas, max-win range, dedupe-key format): the full `normalise.ts` is quoted in [appendix A13](appendix-reference-values.md#a13-normalisation). Where this section and the appendix differ, the appendix wins.
- **Dedupe key:** `title-without-RTP-marker | studio-key`. Strip an explicit percentage always. Strip a bare trailing number only when it equals the record's own RTP rounded down, so "Lucky 88" keeps its number.

## 9. Reference data (`eval-reference.json`)

One entry per raw record:

```ts
{
  rawId, canonicalId,             // duplicates and variants point to the same canonical game
  profile, missingFields[], specials[],
  relatedTo?,                     // for traps derived from another game (spec 02)
  labels: {                       // independent evaluation dimensions, not one cohort
    gameType, qualityProfile, series, semanticCluster, clusterRole,
    volatilityBand, marketProfile, brandScope, distribution, trapTypes
  }
}
```

`manifest.json` records:
- provider/model id, prompt version, seed and timestamp;
- counts: canonical games vs raw records;
- an `evaluation_dimensions` summary that names the denominator of every count (canonical games vs feed records);
- a note when the data came from the offline stand-in.

The timestamp makes the manifest the one output file that differs between runs. Determinism checks (section 12; spec 07 AC7) cover the raw, canonical and reference files, and compare the manifest without its timestamp.

## 10. Determinism and reproducibility

- **PRNG:** mulberry32 (`a += 0x6D2B79F5; t = imul(a ^ a>>>15, a|1); t ^= t + imul(t ^ t>>>7, t|61); return ((t ^ t>>>14)>>>0) / 2^32`).
- **Seeds:** slate 42, offline creative generator 7, operational fields 99, degradation 1234, traps 777 (spec 02).
- Sampling without replacement uses a Fisher–Yates shuffle with that PRNG.
- **File format.** The raw feed's hash is part of the index's identity (spec 05 §4.3), so the bytes matter, not only the values.
  - Every data file is written as `JSON.stringify(value, null, 2) + "\n"`, UTF-8 without a BOM, LF line endings, through `writeFileAtomic`.
  - The raw feed, canonical catalogue and reference data are top-level arrays; the manifest is an object.
  - `stableStringify` (used for `sourceHash` and `indexVersion`) is JSON with object keys sorted recursively and array order kept.
- **The reference draw order** is quoted in [the appendix](appendix-reference-values.md) (A1, A3, A5–A8). Copy those excerpts, constants included, and the offline dataset is byte-identical to the reference.
- **What "reproduce" means.** Same seed and same code → byte-identical output. A re-implementation from the prose alone will produce a dataset with the **same structure** (counts, profiles, edge cases, traps, clusters), but different individual games, because the exact order of random draws is an implementation detail. LLM-generated copy also differs between runs. Judge a rebuild by the acceptance criteria and the manifest's `evaluation_dimensions`, not by diffing files.

## 11. Constraints

- TypeScript strict. Zod for every LLM response and for the canonical schema.
- No API keys in the repo; read `OPENAI_API_KEY` from the environment or `.env`.
- Keep the cost to pennies: about 10 generation calls with a small model.
- **Runtime:** Node 20.12 or later (for `process.loadEnvFile`), built with full ICU, which official builds have. Degradation formats max wins with `toLocaleString("en-GB")`, and a small-ICU build would change the feed. CI pins Node 22 (spec 05 §9).
- **Tests and keys:** tests never load `.env` and always construct providers explicitly, so a local key can't turn a test run into an OpenAI run.
- **Nothing in `src/` (except path constants), `scripts/build-index.ts` or the demo may read the canonical file or the reference data.** That is enforced by a test in a later spec; don't make it fail.

## 12. Acceptance criteria

All of these must pass with **no API key**:

1. `npm run typecheck` is clean.
2. `npm test` covers:
   - every parser in section 8, with the variants from 7.2 (RTP, stakes including "10p", volatility, category, studio variants and swap repair, tags and synonyms, specs nested and flat, max win, RTP-variant dedupe, including "Lucky 88" surviving);
   - fail-closed eligibility: missing markets, missing or unknown status, test builds;
   - determinism: two runs with the same seed give byte-identical raw, canonical and reference files (the manifest differs only in its timestamp);
   - every edge case in 7.3 is present, and specs appear both nested and flat;
   - the slate contract is enforced on LLM output, using a fake LLM (primary theme, clamps, series share a studio, no jackpot without progressive).
3. `npm run generate -- --provider=offline` writes all four files to `data/offline/`; the manifest says "offline".
4. With a key, `npm run generate -- --provider=openai` succeeds, writes to `data/generated/`, and the manifest records the model and prompt version.

## 13. Out of scope

Enrichment, embeddings, the service and the evaluation runner. Those are later specs. Don't add a `min_age` field: age is verified at account level, and an item-to-item recommender knows nothing about the player.

## Decisions

| Point | Decision | Why |
| --- | --- | --- |
| Real brand, studio and jackpot names suggested in the notes | **Changed:** all fictional | Avoids trademark issues and any suggestion of insider data |
| Operational fields (brands, markets, status) from the LLM | **Rejected:** assigned by seeded code | They come from contracts and compliance, not creative copy |
| Full clean catalogue vs a sparse "oracle" of withheld labels | **Kept the full catalogue** | Graded relevance needs truth for every pair, and eligibility is checked exhaustively against it |
| Exactly 100 records | **Changed:** 108 games, 113 feed records | The gap *is* the duplicate/RTP-variant problem ingestion must solve |
| Temperature | 0.7 for generation, 0 for enrichment | Variety in copy; repeatability where outputs are features |
| `min_age` field | **Rejected** | Age is verified at account level; an item-to-item recommender knows nothing about the player's age |
| Studio vs aggregator | **Adopted, with a trap** | A duplicate arriving with the fields swapped would otherwise dodge duplicate detection |
| Restricted features in degraded records | **Added (§7.4)** after a spec-only rebuild of the prototype showed degradation could drop `bonus_buy`. It hadn't happened in the prototype's data (all 3 bonus-buy games were rich) | A compliance flag must not depend on which random profile a record draws |
| RTP-number stripping in titles | **Refined** after a bug: strip a bare number only when it matches the record's RTP | "Game 85" was being merged with an unrelated game |
| File serialisation | **Fixed** in §10: 2-space JSON plus a trailing newline, LF, top-level arrays | The index identity hashes the raw file's text. Left open, a rebuild could match every value and still miss the hash. Whether this reproduces the reference hash is recorded in `REBUILD_NOTES.md` |
| Clamping offline output | **Not clamped:** offline games go through `enforceSlate` only | Clamping would change the reference dataset. The offline data tests software, not catalogue realism |
| Where offline output goes | **`data/offline/`, git-ignored;** only the OpenAI dataset is committed | An offline dataset in `data/generated/` could be mistaken for, or committed as, the submitted one |
| Title collisions across LLM batches | **Repaired, not just rejected:** the later slot is regenerated alone with the used titles listed, up to 3 attempts, and recorded in the manifest's `repairs` | The first OpenAI run failed on two "Bandit Ridge" members sharing a title. Failing the whole run for one repeat wastes the batch calls, and rerunning won't help, because batches still can't see each other. Repairing only the clashing slot keeps the rest of the generation |
| Repeated titles inside the benchmark clusters | **Treated as a collision whatever the studio** (LLM path) | Titles go into the embedding text; two cluster games sharing a title distort cluster recall. Found in the first OpenAI build ("Deep Sea Catch" ×2) |
| `live_dealer` on non-live games | **Removed deterministically**, recorded | The model put it on 4 tables and 2 bingo games. It is a live-game property, and on other types it blurs table against live in matching |
| Layouts that don't fit the game type | **Regenerate a contradiction** (reels on a non-slot; a slot layout without a grid and lines or ways); **clear a non-slot placeholder to null**; both recorded | The first OpenAI build had "live dealer" as a table's layout and "6x5, cascading" on a slot. A clearly wrong layout is worth a call; a placeholder on a non-slot carries no information, so null is honest and costs nothing |
| Manifest repair record | **One `repairs` list with a `kind`**, replacing `titleRepairs` | One place to see everything the generator changed after the model answered |
| Real-world names in generated titles | **A deny-list check in the repair loop** (whole tokens, case- and punctuation-insensitive), regenerating the slot; the list is acknowledged as incomplete | The first rebuild had "Wheel of Fortune Live" (a cluster member) and "Casino Royale Live". The prompt already forbids real names, so only code can enforce §4's hard rule. No list is complete, so it's a backstop to human review, not a replacement. A model-based "is this real?" check was rejected: it costs calls, and isn't reliable about obscure titles either |
| The rest of the first-rebuild inspection findings | **Kept deliberately** | Wheel layouts on card games and game shows, copy that contradicts metadata, empty mechanics, a vacuous misleading-title row and near-duplicate titles are recorded in `REBUILD_NOTES.md` with reasons. They're realistic feed mess or known scope limits, not hard-rule breaches |
