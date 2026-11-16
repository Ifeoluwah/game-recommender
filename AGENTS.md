# Agent instructions for this repository

These are the working rules for any coding agent (or person) working in this repo. They encode the standards we want for any R&D-to-production AI service. Tool-specific notes live in `CLAUDE.md`, which imports this file.

## What this repo is

A related-games recommender for a regulated, real-money casino product. All AI work (LLM enrichment, embeddings) runs at **build time** in `scripts/build-index.ts`. The **service** (`src/service`) only loads a precomputed artefact and applies rules. Read `docs/ADR-001-recommender-architecture.md` before changing anything structural.

## Non-negotiables

1. **No model calls in the request path.** If a change needs one, stop and raise it. It's an ADR change, not a code change.
2. **Eligibility fails closed.** A missing market, status or brand means "not available". Never default to allowed.
3. **The LLM never writes protected fields.** Title, provider, RTP, stakes, max win, layout, jackpot network, brands, markets, status and season come only from source data via `normalise.ts`, and nothing the model returns is merged into them. The model may *read* the title and the descriptive specs (layout, max win, jackpot network) as evidence, because they describe the game (spec 04 §5). It is never sent the regulated or contractual ones: RTP, stakes, brands, markets, status.
4. **Nothing generated is shown to players.** Enrichment output is matching features only.
5. **Source text is untrusted.** Descriptions can contain instructions; prompts must say so, and `guard.ts` must hold even if the prompt fails.
6. **Similarity proposes, rules dispose.** Eligibility (layer 2) and recommendation policy (layer 3) run on every candidate and can never be outweighed by a score.
7. **Decline over pad.** If the result isn't good enough, return a decline reason; the page hides the rail.
8. **Every model, prompt and threshold change is versioned and evaluated.** Prompts live in `prompts/` with a version in the filename. Run `npm run eval:gate` and include the report diff in the PR.
9. **Evaluation labels never reach the system under test.** `catalogue.canonical.json` and `eval-reference.json` are the answers. Nothing in `src/` (except the path constants in `config.ts`), `scripts/build-index.ts` or the demo may read them. Enforced by `tests/boundaries.test.ts`.
10. **Validate at every boundary.** TypeScript `strict` everywhere. Every LLM response is parsed with Zod before use, even with provider-side structured outputs; raw feed records are only read by `normalise.ts`; index artefacts are Zod-validated on load.

## Stack and layout

- **Stack:** TypeScript (`strict`), Node 20+, ESM. Fastify for HTTP, Zod for validation, Vitest for tests, `tsx` to run scripts. Dependencies are pinned in `package.json`; see the rule on new ones below.
- **Layout:** `src/domain` (vocabulary, types), `src/catalogue` (dataset generation), `src/pipeline` (normalise, enrich, guard, build-index), `src/ai` (model providers), `src/service` (the API), `scripts/` (CLI entry points), `eval/` (AI evaluation), `tests/` (software tests), `prompts/` (versioned runtime prompts), `config/` (service config), `docs/` (ADR, evaluation, specs under `docs/prompts/`), `data/generated/` and `artifacts/` (build outputs).
- **Commands:** `npm run typecheck`, `npm test`, `npm run generate -- --provider=offline|openai`, `npm run build:index -- --provider=offline|openai`, `npm start`, `npm run demo`, `npm run eval`, `npm run eval:gate`, `npm run check`, `npm run spec:appendix`.
- **Style:** small modules, named exports, no default exports, classes only for things with state or a provider interface (the cache, metrics, model clients), `camelCase` for code and `snake_case` only for feed fields. Comments explain *why*, not what. Fictional names everywhere: no real operators, studios or brands.

## How to work here

- Run `npm run typecheck`, `npm test` and `npm run eval` before calling work done. `npm run check` adds `eval:gate`, which passes only on a model-built index: an offline build fails the ranking gates by design (spec 06 AC2).
- Software tests (`tests/`) check behaviour. Evaluations (`eval/`) check AI quality. Don't present one as the other: test coverage is not an AI evaluation.
- Add a test for every new decline path or eligibility rule. Add an eval case for every new failure mode found in AI output.
- Keep the offline path working (`--provider=offline`): tests and CI must run with no API key.
- Prefer small, boring code. No new dependencies without a reason in the PR description.
- Never commit secrets. Keys come from the environment; see `.env.example`.
- Larger pieces of work start from a written spec in `docs/prompts/`, committed with the change, so the reasoning behind the code is reviewable.
