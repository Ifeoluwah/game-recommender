# Specs for the coding agent

These are the specifications for this repo, kept so reviewers can see how the problem was broken down and how the agent was constrained.

**How they came about.** The specs were written before this repo, and the repo is built from them: an agent is given `AGENTS.md` and the specs, in order, and nothing else.
- **Stress-tested first.** The specs were stress-tested in an exploratory phase before this build, and what held up was written into them. The **Decisions** section in each spec records what was adopted, changed or rejected, and why.
- **Then built from the specs.** This repo is the production build, made from the specs, spec by spec.

**Together, specs 01–08 describe the whole submission.** Specs 01–03 recreate the dataset (108 canonical games, 113 feed records, every edge case, trap and benchmark cluster). Specs 04–06 add enrichment, the index and service, and the evaluation. Spec 07 hardens the build and the service for production. Spec 08 covers the documents that explain the system (the ADR, evaluation write-up and README) and the Part B skill. Implement them in order, because each builds on the previous ones. Following the prose alone gives the same structure and behaviour; copying the appendix's exact values also gives the same keyless dataset byte for byte (spec 01, section 10).

For future work in this repo, the intended workflow is the one in [`CLAUDE.md`](../../CLAUDE.md): write the spec here first, then run `Read @AGENTS.md and implement @docs/prompts/<spec>.md`, and commit the spec with the change.

| Spec | Covers |
| --- | --- |
| [01-dataset-spec.md](01-dataset-spec.md) | `scripts/generate-catalogue.ts`, `src/catalogue/`: domain fields, two-stage clean-truth → messy-feed generation, data-quality edge cases |
| [02-guardrail-layers-and-compliance-traps.md](02-guardrail-layers-and-compliance-traps.md) | `src/service/recommender.ts`, `src/catalogue/traps.ts`, the eval's layer structure and gates |
| [03-benchmark-clusters-and-evaluation-dimensions.md](03-benchmark-clusters-and-evaluation-dimensions.md) | `src/catalogue/slate.ts` clusters, per-record evaluation labels, per-cluster metrics |
| [04-enrichment-and-guard.md](04-enrichment-and-guard.md) | `src/pipeline/enrich.ts`, `guard.ts`, `prompts/enrich-game.*`: evidence check, guarded LLM enrichment, cache, fallback |
| [05-index-and-service.md](05-index-and-service.md) | `src/ai/`, `src/pipeline/build-index.ts`, `src/service/`, `scripts/`: embeddings, artefact, API, metrics, demo |
| [06-ranking-evaluation.md](06-ranking-evaluation.md) | `eval/`: relevance labels, enrichment and ranking metrics, baselines, sweep, gates, report |
| [07-production-hardening.md](07-production-hardening.md) | Atomic writes, cache checkpointing and pipeline versioning, retry jitter, the number lint on summaries, cache provenance, and logs without player data. From a review of the prototype against a typical "production recommender" design |
| [08-production-architecture-and-docs.md](08-production-architecture-and-docs.md) | `docs/ADR-001-…` (architecture, AWS choices, alternatives, trade-offs, player-facing failure behaviour, scaling triggers, revisit criteria), `docs/EVALUATION.md`, README, `AI_USAGE.md`, the Part B skill and `LEVERAGE.md`, plus `tests/docs.test.ts`. Written from the prototype's documents, which were then discarded |
| [appendix-reference-values.md](appendix-reference-values.md) | The exact constants, word lists, probabilities and draw order the specs refer to, as code excerpts from the prototype. Maintained by hand: a change to quoted code updates its excerpt in the same change. The identity hash in START_HERE §3 checks that the code still reproduces the dataset |

The runtime prompts the system itself sends to models are separate, versioned, and live in [`prompts/`](../../prompts/).
