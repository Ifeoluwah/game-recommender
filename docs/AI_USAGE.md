# AI usage

How AI was used to build this repo, and where AI runs inside the product. "Division of work", "Time spent" and "What wasn't kept" are the candidate's account. Each claim traces to `docs/prompt-log.md` or a commit.

## Tools

**Building the repo.**
- **A coding agent: Claude Code.** It works under [`AGENTS.md`](../AGENTS.md) and [`CLAUDE.md`](../CLAUDE.md), with project settings and a prompt-logging hook in `.claude/`.
- Every prompt given to it during the build is in [`docs/prompt-log.md`](prompt-log.md).
- **Claude (chat), a separate session**, for design review and decisions. It was kept away from the code, so it reviewed the output rather than its own work.
- **A third, fresh Claude session** audited the finished repository against the brief.

**Inside the product** (all at build time, never in the request path):

| Model | Used for | Where |
| --- | --- | --- |
| `gpt-4o-mini` | Generating the synthetic catalogue's creative fields (prompt `generate-catalogue.v2`) | `src/catalogue/creative.ts`, [`prompts/generate-catalogue.v2.md`](../prompts/generate-catalogue.v2.md) |
| `gpt-4o-mini` | Enrichment: proposing matching features for partial and title-only records, behind the guard (prompt `enrich-game.v2`) | `src/pipeline/enrich.ts`, `guard.ts`, [`prompts/enrich-game.v2.md`](../prompts/enrich-game.v2.md) |
| `text-embedding-3-small` | Embedding the enriched records to precompute each game's top-40 neighbours | `src/ai/providers.ts`, `src/pipeline/build-index.ts` |

In production the chat model would be on Bedrock (ADR §4). Every model sits behind an interface with a keyless stand-in: the offline generator, the rules enricher and the hashing embedder.

## Agentic artifacts

| Artifact | Purpose |
| --- | --- |
| [`AGENTS.md`](../AGENTS.md) | The non-negotiable rules for any agent or person: no model in the request path, fail closed, protected fields, untrusted source text, decline over pad, versioned and evaluated changes, label isolation |
| [`CLAUDE.md`](../CLAUDE.md) | Claude-specific notes; imports `AGENTS.md`; the spec-first workflow and the commands to run before finishing |
| [`docs/prompts/`](prompts/) | The specs 01–08 the repo was built from, each with a Decisions table. [`appendix-reference-values.md`](prompts/appendix-reference-values.md) holds exact excerpts (PRNG, draw order, rules, labels) and is **maintained by hand**: a change to quoted code updates its excerpt in the same change |
| [`docs/plan.md`](plan.md) | The agent's milestone checklist, with the planning flags P-1 to P-35 and their resolutions |
| [`REBUILD_NOTES.md`](../REBUILD_NOTES.md) | Every choice made where a spec was silent, and every spec gap found during the build |
| [`docs/prompt-log.md`](prompt-log.md), `.claude/hooks/log-prompt.cjs` | Every prompt given to the coding agent, logged by a hook |
| [`.claude/skills/productionise-ai-prototype/`](../.claude/skills/productionise-ai-prototype/) | Part B: the reusable skill and its ADR template ([`LEVERAGE.md`](LEVERAGE.md)) |
| [`prompts/`](../prompts/) | The versioned runtime prompts the product sends to models, with the version in the file name |
| [`eval/release-gates.json`](../eval/release-gates.json) | The release gates as data: a threshold and a `why` for each, changed only in review |
| [`.github/workflows/check.yml`](../.github/workflows/check.yml), [`release-gate.yml`](../.github/workflows/release-gate.yml) | CI, with no API key: `check` runs typecheck, tests and the demo ("does the code work?"); `release-gate` runs the release gates on the committed build ("is it fit to ship?") |
| [`docs/notes/`](notes/) | Agent-written inspection and analysis notes that fed decisions (the OpenAI catalogue inspection, the threshold analysis) |

## How it was built

- **The specs came first.** A deliberate spike (v1) stress-tested them and the evaluation method end to end against the real model, and what it found went back into the specs. This build's keyless dataset reproduces the spike's byte for byte (identity hash `5caf2bbb0f343546`). See [`docs/prompts/README.md`](prompts/README.md).
- **This repo was then built from them, spec by spec**, with one milestone per spec (`docs/plan.md`):
  - the agent planned first and flagged ambiguities, and those were resolved in the spec text before any code;
  - each milestone was implemented, tested and checked against its acceptance criteria, then committed.
- **The OpenAI build was generated, inspected and repaired.** It was inspected against the specs (`docs/notes/openai-catalogue-inspection.md`). Generator repairs were specified, built and rerun until it was fit to commit.
- **The evaluation drove one service rule.** The first OpenAI evaluation failed the bad-recommendation gate. The analysis that followed (`docs/notes/threshold-analysis.md`) led to the theme-or-series relatedness rule, with its costs disclosed in `EVALUATION.md`.

## Division of work

**What I did** (each item visible in `docs/prompt-log.md`):
- wrote the specs, the agent rules and the two runtime prompts before the build;
- resolved the planning flags, including changes to the agent's proposals for P-6, P-7, P-8 and P-32 (00:41);
- inspected the OpenAI catalogue and specified each generator repair: title-collision repair, `live_dealer` and layout fixes, the real-name deny-list (01:39–02:15);
- read the evaluation, asked for the read-only threshold analysis, then chose the relatedness rule and rejected the threshold-only fixes (03:00–03:32);
- set what each document had to disclose, and required every number to come from the report (03:56, 07:37);
- split CI into "does the code work" and "is it fit to ship", ran a secrets and stray-file audit, and made every commit (08:27–08:37).

**What the agent did:**
- wrote the plan and flagged ambiguities;
- implemented each spec with its tests;
- ran the offline builds and evaluations;
- wrote the analysis notes and the first drafts of the ADR, EVALUATION.md and the README.

I ran the paid OpenAI steps myself.

## Time spent

All times UTC, from the prompt logs and commit histories. About 11h40m active in total, well over the brief's 4 hours, because i took a break

**Setup** (Sat 14 Nov, ~21:00–21:40, ~40m): installed Claude Code, Git and Node on Windows; committed the spec-only skeleton; added the prompt-logging hook.

**v1, the spike** (Sat 21:40 – Sun 08:59, with a break from 00:11 to 05:22, ~6h10m active; not in this repo). It was a deliberate end-to-end run, to stress-test the specs and the evaluation method against the real model before the production build:

| Part | Window |
| --- | --- |
| Plan with ~30 flags; spec review with 12 changes (offline output in git-ignored folders, OpenAI run early, honest gate wording, expected numbers removed from START_HERE, inferred volatility fails closed, appendix exporter dropped) | 21:55–22:36 |
| Specs 01–03 and the first failures from the real model: empty `themes` rejected by Zod (parse leniently, repair, then validate); a title and studio repeated across batches (regenerate the colliding slot); duplicate titles within a cluster; `live_dealer` on non-live games; a null layout failing the run (missing isn't contradictory, so set it null) | 22:36–00:11 |
| Specs 04–06 and the evaluation: 14/15 gates with bad-rec failing; a threshold of 0.7 broke the lift gate. That exposed a measurement weakness: comparing mean nDCG over different answered sets rewards declining. The fix, measuring lift on the paired query set, isn't in the production build yet (`eval/evaluate.ts:820`) | 05:22–06:34 |
| Specs 07–08, then a review that found the demo failing on NJ, two junk files, Windows line-ending failures and two stale numbers | 06:34–08:59 |

**Spec rework** (Sun 15 Nov, not logged): the spike's findings went back into the specs, and its expected result numbers came out.

**The production build, this repo** (Mon 16 Nov, 00:27–03:56 and 07:16–08:40, ~4h50m active), from the specs:

| Part | Window | Time |
| --- | --- | --- |
| Planning and flag resolution | 00:27–01:01 | ~35m |
| Specs 01–03: dataset, guardrails, clusters | 01:01–01:35 | ~35m |
| OpenAI catalogue inspection and generator repairs | 01:35–02:23 | ~50m |
| Specs 04–05: enrichment, guard, index, service, OpenAI build | 02:23–02:54 | ~30m |
| Spec 06: evaluation, threshold analysis, relatedness rule | 02:54–03:46 | ~50m |
| Spec 07: hardening, demo decline, per-brand coverage | 03:47–03:56, 07:16–07:36 | ~30m |
| Spec 08: ADR, docs, Part B check, CI split, audit | 07:37–08:40 | ~65m |

## What wasn't kept

**Model output (`gpt-4o-mini`, catalogue generation):**
- **The first generation run.** Two slots came back with the same title from the same studio, because batches can't see each other's titles. I rejected the run and specified a repair loop that regenerates the later slot with the used titles listed (`37e881b`).
- **The first catalogue that generated.** It had a repeated title inside a benchmark cluster, `live_dealer` on 6 non-live games, and layouts that contradicted the game type. I rejected it as unfit to commit, specified three repairs and regenerated (`37e881b`, `docs/notes/openai-catalogue-inspection.md`).
- **Real-world titles** ("Wheel of Fortune Live", "Casino Royale Live"). I rejected them and added a real-name deny-list to the repair loop (`ca7749b`). The committed build records 22 repaired outputs in `data/generated/manifest.json`.
- **Kept on purpose:**
  - win-promise copy in 8 of 108 descriptions, and metadata that contradicts its own copy. Both are realistic feed mess for the guard to handle;
  - two misleading-title traps the model defused (g-019, g-057). They're disclosed as proving nothing, not regenerated.

**Coding-agent output:**
- **Threshold-only fixes** for the failing bad-rec gate: `minScore` 0.69, and the sweep's suggested 0.6. I rejected them as fitted to one run of drifting embeddings and added the theme-or-series relatedness rule instead (`3d94da0`).
- **"Same studio" as a third relation in that rule**, which I'd asked for. I dropped it once measured: bad-rec 0.385, still failing, because 6 studios relate a fifth of the catalogue to any seed (`3d94da0`).
- **Demo case 3 exited 1** once the rule made liberty/NJ decline. I changed it to accept that documented decline, so a reviewer's first command works (`de7a2c3`).
- **The agent was right not to follow one of my instructions.** I had said g-050 answers. The report showed it declines, and the docs say so.

The full list, with commits, is in [`docs/notes/candidate-notes.md`](notes/candidate-notes.md).
