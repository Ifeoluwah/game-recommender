# AI usage

How AI was used to build this repo, and where AI runs inside the product. Sections marked **[CANDIDATE TO WRITE]** are left for the candidate on purpose: an agent must not make claims about what the human did.

## Tools

**Building the repo.**
- **A coding agent: Claude Code.** It works under [`AGENTS.md`](../AGENTS.md) and [`CLAUDE.md`](../CLAUDE.md), with project settings and a prompt-logging hook in `.claude/`.
- Every prompt given to it during the build is in [`docs/prompt-log.md`](prompt-log.md).

> **[CANDIDATE TO WRITE]** Any other AI tools used (chat assistants, reviewers, IDE assistants), and for what.

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

- **The specs came first.** They were developed against a throwaway prototype, requirement by requirement, then checked by two fresh-agent rebuilds from the specs alone. The second reproduced the prototype's keyless dataset byte for byte (the identity hash `5caf2bbb0f343546`). See [`docs/prompts/README.md`](prompts/README.md).
- **This repo was then built from them, spec by spec**, with one milestone per spec (`docs/plan.md`):
  - the agent planned first and flagged ambiguities, and those were resolved in the spec text before any code;
  - each milestone was implemented, tested and checked against its acceptance criteria, then committed.
- **The OpenAI build was generated, inspected and repaired.** It was inspected against the specs (`docs/notes/openai-catalogue-inspection.md`). Generator repairs were specified, built and rerun until it was fit to commit.
- **The evaluation drove one service rule.** The first OpenAI evaluation failed the bad-recommendation gate. The analysis that followed (`docs/notes/threshold-analysis.md`) led to the theme-or-series relatedness rule, with its costs disclosed in `EVALUATION.md`.

## Division of work

> **[CANDIDATE TO WRITE]** What you decided, wrote or reviewed yourself, and what the agent did.

## Time spent

> **[CANDIDATE TO WRITE]** Roughly how long each part took.

## What wasn't kept

> **[CANDIDATE TO WRITE]** AI output you changed, rejected or threw away, and why.
