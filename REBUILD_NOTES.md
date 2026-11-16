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
- **Ranking numbers (P-16):** whether nDCG@5 0.549, bad-rec 0.606 and coverage 0.979 reproduce with the specified `recommend()` loop. *Pending milestone 6.*

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
