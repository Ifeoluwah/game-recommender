# Spec 07: production hardening of the build pipeline and service

> **How to use this spec.** `Read @AGENTS.md and implement @docs/prompts/07-production-hardening.md`.
> It builds on specs 04 (enrichment) and 05 (index and service). Those specs hold the resulting contracts; this one is the change set, kept as one reviewable unit.
> Where this spec and `AGENTS.md` disagree, `AGENTS.md` wins. Flag the conflict rather than guessing.
>
> **Provenance.** This spec came from a review note comparing the prototype (see `docs/prompts/README.md`) with a typical "production recommender" design. Specs 04 and 05 already hold the resulting contracts; this spec is the change set, kept as one reviewable unit.

## 1. Goal

Make the offline build safe to re-run, interrupt and evolve, and make the service's logs and failure modes auditable without leaking player data. **Ranking behaviour and evaluation results must not change.**

## 2. Deliverables

| Path | Change |
| --- | --- |
| `src/util/misc.ts` | `writeFileAtomic(path, text)`; jitter in `withRetry` |
| `src/pipeline/enrich.ts` | `ENRICH_PIPELINE_VERSION` in the cache key; checkpointed, atomic cache saves; `cached` / `proposedAt` provenance |
| `src/pipeline/guard.ts` | Number patterns in the summary lint |
| `src/domain/types.ts` | `EnrichmentRecord.cached`, `EnrichmentRecord.proposedAt` |
| `scripts/build-index.ts`, `scripts/generate-catalogue.ts` | All outputs written atomically |
| `src/service/server.ts` | Request-log serializer without client IP |
| `docs/ADR-001-recommender-architecture.md` | Seed-availability rows in the failure table |
| `docs/prompts/04-…`, `05-…` | Contracts updated (spec 04 §6, §8, §10; spec 05 §4.4, §6.2, Decisions) |
| `tests/enrichment.test.ts`, `tests/api.test.ts` | New tests (section 5) |

## 3. Requirements

### 3.1 Versioned cache invalidation

- Cache key = `sha256(sourceHash | model | promptVersion | ENRICH_PIPELINE_VERSION)`.
- `ENRICH_PIPELINE_VERSION` (start at `enrich-pipeline.v1`) versions what shapes a proposal besides the prompt: `buildEnrichmentInput`, the response schema and the parser. Bump it when any of them change.
- The guard is **not** part of the key: it runs on every build, cached or not.
- Embeddings aren't cached, so they need no version.

### 3.2 Rate limits, retries and crash safety

- **Concurrency:** keep `mapLimit` with a default of 5 calls in flight.
- **Retries:** `withRetry` delays are `base × 2^attempt × (0.5 + Math.random())`, with base 500 ms and 3 attempts. Jitter uses `Math.random`, because it affects timing, not data, so determinism is unaffected.
- **Atomic writes:** `writeFileAtomic` creates the directory, writes `<path>.<pid>.tmp`, then `renameSync` to the final path. Use it for:
  - `artifacts/index.json`, `enriched-catalogue.json` and `eval-variants.json`;
  - every `data/generated/*` file;
  - the enrichment cache.
- **Checkpointing:** save the cache after every 10 new proposals, and in a `finally` around the whole run, so completed paid calls survive an exception or interruption.

### 3.3 Output guard: numbers in summaries

Add `/\d+(\.\d+)?\s?%/` and `/[£$€]\s?\d/` to the banned summary patterns. A match discards the summary (it isn't repaired), like every other banned pattern. Regulated figures come only from authoritative source fields.

### 3.4 Provenance

`enrichment.cached` is true for cache hits. `enrichment.proposedAt` is set as follows:
- **Cache hits:** the cache entry's `createdAt`.
- **Fresh LLM calls:** now.
- **Rules and skipped records:** null.

Cache entries store `createdAt`; older entries without it give `proposedAt: null`. Offline artefacts gain only `cached: false, proposedAt: null`.

### 3.5 Logging without player data

- Fastify's default request serializer logs the client IP and port. Replace it with `{ id, method, url }`.
- Keep the request id from `x-request-id`.
- **Never log a player's restriction.** A `PLAYER_RESTRICTED` decline used to appear in the per-request `recommendation` line, tied to a request id. Restricted requests now get no such line. They're still counted in the aggregate metrics, and Fastify's own request/response lines (id, method, URL, status) still appear.
- `ServerDeps.logStream` (optional) lets tests capture the logs.

### 3.6 Seed availability, made explicit

There's no behaviour change. Add rows to the ADR failure table:
- unlicensed or test-build seed → `SEED_NOT_AVAILABLE`, no rail;
- withdrawn or out-of-season seed → alternatives still shown, on purpose (spec 02 §6.2).

## 4. Constraints

- No new dependencies (no `p-limit`: `mapLimit` already exists).
- No change to ranking, rules, thresholds or gates. `npm run eval` must give identical gate values on the offline build.
- The offline path still runs with no key.

## 5. Acceptance criteria (no API key)

1. Typecheck and all tests pass.
2. **Cache provenance:** a second run marks the unchanged record `cached: true`, with an ISO `proposedAt`, and the changed record `cached: false`.
3. **Cache key:** the key differs when the model, the prompt version or the pipeline version changes, and is stable otherwise.
4. **Interrupted run:** with concurrency 1, a run that throws on the third record (outside the per-record fallback) rejects. The cache file still holds the first two proposals, and no `.tmp` file is left.
5. **Number lint:** summaries "A 96.5% RTP slot with expanding wilds." and "Win up to £250,000 on expanding wilds." are discarded with a `summary_banned:` flag.
6. **Logs** (`tests/api.test.ts`): two requests, one restricted, both with `remoteAddress` set. The captured logs:
   - contain both request ids;
   - contain the `recommendation` line for the unrestricted request;
   - contain no IP, port, `remoteAddress`/`remotePort` or any mention of the restriction.
7. **Unchanged results:** after an offline regenerate and rebuild:
   - the raw feed is byte-identical;
   - the gate values match the previous report;
   - 39/39 planted traps are handled;
   - `npm run spec:appendix -- --check` passes.

## Decisions

| Point (from the review note) | Decision | Why |
| --- | --- | --- |
| Pipeline version in the content hash | **Adopted,** as a separate version in the cache key | Prompt and model were already in the key; this covers the input builder and schema |
| `p-limit` for concurrency | **Not added:** the existing `mapLimit` does the same | No new dependency without a reason (AGENTS.md) |
| Backoff with jitter on 429/5xx | **Adopted** for all failures | Malformed output is also worth one retry; per-record fallback catches the rest |
| Atomic writes and checkpointing | **Adopted** | A killed build must not corrupt what the service loads or lose paid calls |
| Normalise free-text themes after the LLM | **Already covered:** closed vocabulary in the strict schema, plus guard rejection and counting | Mapping would hide drift; rejecting it makes it measurable |
| Regex check for percentages in the summary | **Adopted, and extended to money amounts.** Discard, don't strip | A repaired summary is still the model's text (spec 04 Decisions) |
| Internal store vs public DTO | **Already covered** | The artefact has no vectors; responses carry ID, title and score only |
| Pre-normalise vectors for dot product at serving time | **Not applicable** | Neighbours are precomputed; the service does no vector maths |
| Seed deprecated or unavailable: decline or fall back | **Decline when unlicensed or a test build; still recommend when withdrawn or out of season.** Never fall back to popular games | Rule 7 (decline over pad); now in the ADR |
| Fail fast or degrade on a bad artefact | **Not ready (503), no crash, no fallback matching** | Old instances keep serving; unevaluated rankings never reach a regulated page |
| `enrichedBy` and timestamp provenance | **Adopted** as `cached` and `proposedAt`, alongside the existing method and per-field provenance | Auditability without changing the method enum |
| Structured request telemetry without PII | **Already logged; two leaks fixed** | The default serializer logged the client IP, and the decline reason exposed a player's safer-gambling restriction per request. The second was found by writing this spec's log test |
