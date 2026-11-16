# Spec 05: index build and the recommendation service

> **How to use this spec.** `Read @AGENTS.md and implement @docs/prompts/05-index-and-service.md`.
> It builds on specs 01–04. The request-time rules (eligibility, policy, decline reasons) are specified in [spec 02, section 6](02-guardrail-layers-and-compliance-traps.md); this spec covers everything around them.
> Where this spec and `AGENTS.md` disagree, `AGENTS.md` wins. Flag the conflict rather than guessing.

## 1. Goal

Split the system at the line between **build time** (all AI work) and **request time** (no AI at all).

An offline build turns the messy feed into a versioned, validated index artefact. A small, stateless TypeScript service loads it and answers "Because you played X…" in well under a millisecond, with no network calls. When it can't answer well, it declines and the page hides the rail.

## 2. Deliverables

| Path | What |
| --- | --- |
| `src/ai/providers.ts` | `Embedder` interface, `OpenAiEmbedder`, `HashingEmbedder`, `resolveProviderMode` (section 3). The last already exists from spec 01 |
| `src/domain/index-schema.ts` | `IndexSchema` (Zod) and `ServiceGame` (section 4.3), with no AI imports, so the service can load it without loading a model SDK |
| `src/pipeline/build-index.ts` | Embedding text, neighbours, `buildIndex` (section 4); re-exports `IndexSchema` |
| `src/service/service-config.ts` | `ServiceConfigSchema` and loader (section 6.3; created in spec 02) |
| `scripts/build-index.ts` | CLI: `npm run build:index -- --provider=openai\|offline` (section 4.4) |
| `src/service/index-store.ts` | `loadIndex` with validation (section 5) |
| `src/service/recommender.ts` | Request logic (spec 02, section 6) |
| `src/service/server.ts` | HTTP API (section 6) |
| `src/service/metrics.ts` | Prometheus-format metrics (section 7) |
| `src/main.ts` | Entry point (section 8) |
| `scripts/demo.ts` | `npm run demo`: one command that shows every path (section 8) |
| `config/service.json` | Brands, restrictions, policy, recommendation settings, cache TTL (section 6.3) |
| `tests/api.test.ts`, `tests/pipeline.test.ts`, `tests/boundaries.test.ts` | Section 10 |

## 3. Embedders

```ts
interface Embedder { readonly id: string; readonly dim: number; embed(texts: string[]): Promise<number[][]> }
```

- **`OpenAiEmbedder`:**
  - id `openai:<model>`, where the model comes from `OPENAI_EMBEDDING_MODEL` (default `text-embedding-3-small`);
  - dimension 1536, or 3072 for `-large`;
  - batches of 100, with results put back in input order.
- **`HashingEmbedder`:** a deterministic, keyless stand-in, never the shipped configuration.
  - id `hashing-v1`, dimension 512.
  - Lowercase the text, replace anything outside `[a-z0-9_ ]` with spaces, then split.
  - Drop tokens of 1 character and the stopwords (`a an and the of in on to for with by at from is are it its this that your you into as be or game games`).
  - For each token, take `h = sha256(token)`. The index is `parseInt(h[0..8], 16) % 512`. The sign is `+1` if `parseInt(h[8..10], 16)` is even, else `−1`.
  - Weight 2 for tokens containing `_` or equal to `slot|table|live|bingo|low|medium|high`, else 1.
  - L2-normalise the result.
- **`resolveProviderMode(argv)`:** `--provider=openai|offline`. Without the flag, use `openai` if `OPENAI_API_KEY` is set, else `offline`. Reject unknown values.
- **Keys:** scripts load `.env` from the repo root if present (`process.loadEnvFile`), ignoring a missing file. A script that chose its provider without the flag logs which one it picked and why. Tests never load `.env`.

**Where each build lives.** The provider mode also picks the folders:

| | Data (spec 01) | Artefacts | Report (spec 06) | In git |
| --- | --- | --- | --- | --- |
| `openai` (the shipped build) | `data/generated/` | `artifacts/` | `eval/reports/` | committed |
| `offline` | `data/offline/` | `artifacts/offline/` | `eval/reports/offline/` | ignored |

`generate` and `build:index` write to their mode's folders. `demo` and `eval` read the **OpenAI** build unless given `--provider=offline`. Their default doesn't depend on whether a key is set, because they make no model calls. If the build they're asked for is missing, they exit 1 with a message naming the missing file and the command that creates it. They never fall back to the other build.

## 4. Index build (offline, the only place models are called)

### 4.1 Embedding text

**Enriched (what ships)** is built only from guarded, structured fields plus the neutral summary, *not* the raw description, to limit the pull of injected or promotional copy:

```
Title: <title>. Type: <type>. Themes: <a, b>. Mechanics: <a, b>. Volatility: <v>. Layout: <layout>. Jackpot network: <n>. Summary: <summary>
```

Omit any part that's empty. Each part ends with a full stop except the summary; parts are joined with a single space. The exact functions are in [appendix A16](appendix-reference-values.md#a16-embedding-text-and-the-keyless-embedder), and the keyless embedder in A17; the neighbour lists only reproduce if both are copied exactly.

**Raw-text baseline** (for the evaluation) is the source as-is, joined with `". "`: title, game type, themes + mechanics + unknown tags, reel layout, jackpot network, description.

### 4.2 Neighbours

- Exact cosine similarity, all pairs, excluding self.
- Keep the **top 40** per game as `[id, score]`, with scores rounded to 4 decimals.
- Sort by score descending, then id ascending (deterministic ties).
- O(n²) is fine at this scale; the ADR names the trigger for approximate methods.

### 4.3 Artefact (`index.json` in the build's artefact folder, Zod-validated on write and load)

`IndexSchema` lives in `src/domain/index-schema.ts`. `catalogueHash` hashes the raw feed file exactly as written (spec 01 §10).

`enrichment` describes how the **build** was run, not each record: offline `{ method: "rules", model: null, promptVersion: "rules.v1" }`; OpenAI `{ method: "llm", model: <llm.id>, promptVersion: "enrich-game.v2" }`. Records that were skipped or fell back keep their own method in `enriched-catalogue.json`.

```ts
{
  schemaVersion: 3,             // 3 added `themes` to ServiceGame (spec 02 §6.2, quality:no_shared_theme)
  indexVersion: string,         // first 12 hex chars of sha256(stable-stringify({ catalogueHash, enrichment, embedding id, neighbours }))
  builtAt: ISO string,
  catalogueHash: string,        // first 16 hex chars of sha256(raw feed file text)
  enrichment: { method, model | null, promptVersion },
  embedding: { id, dim },
  games: Record<id, ServiceGame>,
  neighbours: Record<id, Array<[id, score]>>
}
ServiceGame = { id, title, provider, gameType, seriesId, dedupeKey, brands, markets,
                status ("active" | "withdrawn"), isTestGame, seasonMonths, insufficient,
                volatility, maxStake, minStake, mechanics, themes }
```

No vectors go into the service artefact; the service doesn't need them.

**Where each `ServiceGame` field comes from:**
- **From the normalised source record** (via the guard, which never changes them): `status`, `isTestGame`, `brands`, `markets`, `seasonMonths`, stakes, `provider`, `seriesId` and `dedupeKey`. `status` is already collapsed to `active`/`withdrawn` by `normalise.ts`, with the raw value kept as an `issues` entry. `seriesId` is the slug of the `franchise` field when the feed has one, and otherwise null.
- **From the guarded enriched record:** `gameType`, `volatility`, `mechanics` and `themes`. A source value always wins over an inferred one (spec 04 §6). This is a deliberate decision with a known trade-off; see section 11.
- `themes` is read only by the quality rule `quality:no_shared_theme` (spec 02 §6.2). Like every matching field it is never sent to clients. The rule only ever removes candidates, so a theme the enricher missed can cause a decline but never an ineligible item.

**Schema 3 and the committed OpenAI index.** The first OpenAI index was written as schema 2, without `themes`. It was migrated in place rather than rebuilt, because a rebuild re-embeds, and OpenAI embeddings move slightly between calls, which would shift the evaluation for reasons unrelated to the rule. Each game's `themes` was set from the same build's `enriched-catalogue.json`, every migrated game was checked equal to `toServiceGame()` of its enriched record, and `schemaVersion` was set to 3. Neighbours, scores and `indexVersion` (which hashes neither `games` nor `schemaVersion`) are unchanged. The next `build:index` writes schema 3 directly. A schema 2 index fails validation on load.

### 4.4 Build script

1. Read `catalogue.raw.json` from the mode's data folder (section 3), then run `normaliseRecord` on every record (spec 01).
2. `enrichCatalogue` with the LLM (OpenAI mode) or rules (offline), using the cache (spec 04). Log the stats, and warn on fallbacks.
3. `buildIndex(enriched, embedder, { catalogueHash, enrichment })`.
4. **Evaluation variants,** embedded with the **same** embedder for a fair comparison:
   - `enriched` = the index neighbours;
   - `raw_text` = neighbours from raw-text embeddings;
   - in OpenAI mode, also `rules_enriched` = neighbours from rules-enriched text.
5. Write to the mode's artefact folder, each **atomically** (temp file + rename, `writeFileAtomic` in `src/util/misc.ts`), so a killed build never leaves a half-written artefact for the service or the next build to load. The generate script writes its files the same way.
   - `index.json`;
   - `enriched-catalogue.json` (pretty-printed, for inspection and evaluation);
   - `eval-variants.json` = `{ indexVersion, embedding, variants }`.
6. Never read the canonical catalogue or the reference data (boundary rule).

## 5. Loading the index (`loadIndex(path, config)`)

Return `{ ok: true, index }` or `{ ok: false, error }`. **Never throw.**

| Problem | Error text contains |
| --- | --- |
| File missing | "not found" |
| Not JSON | "not valid JSON" |
| Schema or version mismatch | "failed validation" |
| No `minScoreByEmbedder` entry for the artefact's embedder | "no score threshold" |

A bad artefact makes the process **not ready**, not crashed: the load balancer keeps sending traffic to instances holding the previous good version.

## 6. HTTP API (Fastify)

### 6.1 Routes

| Route | Behaviour |
| --- | --- |
| `GET /health` | `200 {status:"ok"}`, always |
| `GET /ready` | `200 {status:"ready", indexVersion, embedding, enrichment, games}` when loaded, else `503 {status:"not_ready", error}` |
| `GET /metrics` | Prometheus text (section 7) |
| `GET /v1/games/:gameId/related?brand=&market=&limit=` | Section 6.2 |

### 6.2 `/v1/games/:gameId/related`

**Validate the request** (Zod):
- `brand` non-empty, `market` ∈ markets, `limit` an integer 1–50;
- otherwise `400 {status:"error", error:"invalid_request", details}`.

Then:
- unknown brand → `400 {status:"error", error:"unknown_brand"}`;
- brand not operating in that market → `400 {status:"error", error:"brand_not_offered_in_market"}`;
- no index loaded → `503 {status:"unavailable", items:[]}`.

**Call** `recommend(index, config, { gameId, brand, market, limit, playerRestricted, month })`:
- `playerRestricted` = header `x-player-restricted: true`, case-insensitive;
- `month` comes from an injectable clock (`now?: () => Date`), default the current UTC month;
- the limit is clamped to `[1, maxLimit]`, default `defaultLimit`.

**Response:** the same shape every time. Strip the diagnostics from it, but log them.

```json
{ "gameId", "seedTitle" (or null), "brand", "market", "indexVersion",
  "status": "ok" | "declined", "reason"?, "items": [{ "gameId", "title", "score" }] }
```

- Status code: 404 when the reason is `UNKNOWN_GAME`, otherwise 200 (a decline is a valid answer: "hide the rail").
- Headers:
  - `x-index-version`;
  - `vary: x-player-restricted`;
  - `cache-control: public, max-age=<cacheMaxAgeSeconds>`, or `private, no-store` for restricted players. Responses aren't personalised, so unrestricted ones are cacheable at the CDN.
- One structured log line per request: gameId, brand, market, outcome, reason, item count, `filtered` (the diagnostics) and latency in ms. Each carries Fastify's request id, taken from `x-request-id` when the caller sends one.
- **No player data in logs.** Override Fastify's request serializer to log only `{ id, method, url }`, because the default includes the client IP and port. Never log a player's restriction: restricted requests get no `recommendation` line (they're counted in metrics only), because a `PLAYER_RESTRICTED` reason next to a request id is player data. The service receives no player identifier at all.

### 6.3 `config/service.json`

Brands, `restrictedMechanicsByMarket` and `policy` are as in spec 02, section 6.1. In addition:

```json
"recommendation": { "defaultLimit": 6, "maxLimit": 12, "minResults": 3, "maxPerProvider": 3, "maxPerSeries": 2,
                    "minScoreByEmbedder": { "openai:text-embedding-3-small": 0.45, "hashing-v1": 0.3 } },
"cacheMaxAgeSeconds": 300
```

The whole file is Zod-validated on load.

The score threshold belongs to an embedding model. A new model needs its own threshold, chosen from the evaluation's sweep (spec 06). Without one, the service refuses that index. So `OPENAI_EMBEDDING_MODEL` can be changed, but only `text-embedding-3-small` builds load until another model gets a threshold. `.env.example` and the README say so.

## 7. Metrics (`/metrics`, Prometheus text format)

- `recs_requests_total{outcome, reason, brand}` counter, one count per `/related` request:
  - `outcome` is `ok`, `declined`, `invalid` (any 400) or `unavailable` (503);
  - `reason` is the decline reason or 400 error code, `none` when ok;
  - `brand` is the requested brand when it's in the config, else `invalid`, so clients can't create unbounded label values.
- `recs_latency_ms` histogram, with buckets 1, 2, 5, 10, 25, 50, 100 and `+Inf`, plus `_sum` and `_count`.
- `recs_index_info{version}` gauge: 1 when loaded.

## 8. Entry point and demo

**`src/main.ts`:**
- load and validate the config, then `loadIndex` (path from `INDEX_PATH`, default `artifacts/index.json`, the OpenAI build; set `INDEX_PATH=artifacts/offline/index.json` to serve an offline one);
- build the server with logging on; if the index didn't load, log the error and serve, reporting not ready;
- listen on `127.0.0.1:${PORT ?? 3000}`;
- close gracefully on SIGINT/SIGTERM.

**`scripts/demo.ts`:** load the index in-process: the committed OpenAI build by default, or the offline one with `--provider=offline` (section 3; exit 1 if it's missing). Pick games from that build's enriched catalogue and index by scanning in id order, so the choice is deterministic. Print one block per case, using `app.inject`, with its status code and reason. The picks:
- cases 1 and 2: the first game that returns `ok` on `aurora`/GB and on `harbour`/GB;
- case 3: the first game that returns `ok` on `liberty`/NJ. **If none does, the first game that declines there with `NO_CONFIDENT_MATCHES`, expected as that decline and printed with a note saying no liberty/NJ seed gets a rail in this build.** That's the case on both committed builds since `quality:no_shared_theme` (spec 02 §6.2): about 22 live, eligible games serve NJ, spread over many themes, so no seed finds three theme-mates. A reviewer's first command must work on the committed build, so the demo shows the decline instead of exiting 1. The pick lives in `scripts/demo-cases.ts` so both branches are tested (`tests/demo-cases.test.ts`);
- case 4: the first game flagged `insufficient`;
- case 5: the first game not licensed in GB, requested on `aurora`/GB;
- cases 6–10: fixed inputs.

The cases:
1. normal (a well-described slot on `aurora`/GB);
2. the same game on another brand;
3. an NJ player on `liberty`/NJ → `ok`, or the documented `NO_CONFIDENT_MATCHES` decline when no NJ seed gets a rail;
4. a thin seed → `INSUFFICIENT_SOURCE_DATA`;
5. a seed not licensed in the market → `SEED_NOT_AVAILABLE`;
6. a restricted player → `PLAYER_RESTRICTED`;
7. a disabled brand → `BRAND_DISABLED`;
8. an unknown game → 404;
9. an invalid market → 400;
10. a brand not in the market → 400.

## 9. CI

Two workflows, both on Node 22, on push and pull request. Neither uses `continue-on-error`.

| Workflow | Steps | Question it answers |
| --- | --- | --- |
| `.github/workflows/check.yml` | `npm ci`, `typecheck`, `test`, `demo` | **Does the code work?** |
| `.github/workflows/release-gate.yml` | `npm ci`, `eval:gate` | **Is this build fit to ship?** |

**Why they're separate.** Software tests and AI evaluation answer different questions (AGENTS.md: "don't present one as the other"), so they report separately.
- A red `check` means the code is broken.
- A red `release-gate` means the code works but the committed build doesn't meet the release bar. That's the gate doing its job: **the release is blocked pending review**.
- In one workflow, a gate failure would hide whether the tests passed, and the pressure to get CI green would fall on the gates. `continue-on-error` would hide the failure instead. Neither is acceptable.

**Today `release-gate` is red, as intended:** `ndcgLiftOverRawText` is −0.003 against a gate of ≥ 0 (`eval/reports/latest.md`). The fix is a better build or a reviewed gate change, never a tuned gate.

Both run on the **committed** artefacts, so CI needs no API key.
- `demo` and `eval:gate` read the committed OpenAI build.
- Tests never read either build's files; they build their own offline ones in memory.

**Which artefacts are committed:** the shipped build (`--provider=openai`) in `data/generated/`, `artifacts/` and `eval/reports/`. Offline builds live in git-ignored folders (section 3), so they can't be committed by accident. Until the first OpenAI build is committed, both `demo` and `eval:gate` exit 1 with a "no OpenAI build" message. That's correct: there is nothing to demo or release yet.

## 10. Acceptance criteria (no API key)

1. **`tests/pipeline.test.ts`:** an end-to-end offline build of the **full** offline dataset (the trap generator needs at least 7 standalone slots, so a small slate can't work): generate → degrade → normalise → rules-enrich → hashing-embed → `buildIndex`) produces one game per raw record; no neighbour list contains its own game; scores are non-increasing.
2. **`tests/api.test.ts`:**
   - an ok response has the stable shape, cacheable headers and `x-index-version`;
   - a restricted player gets `private, no-store` and a decline;
   - an unknown game gets 404 with the same shape;
   - 400 for: a missing market, an unknown market, an unknown brand, `limit=0`, a brand not offered in the market;
   - with no index: `/ready` 503, `/health` 200, the API 503;
   - `/metrics` shows the request counter and `recs_index_info{version="…"} 1`;
   - `loadIndex` rejects missing, corrupt, wrong-schema-version and unknown-embedder artefacts without throwing, and accepts a valid one.
3. **`tests/boundaries.test.ts`:**
   - no file in `src/` (except `config.ts`), `scripts/build-index.ts` or `scripts/demo.ts` references the canonical catalogue, the reference data or the `eval/` folder, whether by file name or by importing `config.ts`'s path constants for them;
   - no file in `src/service/` imports `openai` or the AI providers module.
4. **Commands:** `npm run build:index -- --provider=offline`, then `npm run demo -- --provider=offline`, show all 10 cases with the expected status codes and reasons (case 3 as §8 allows), and exit 0. So does `npm run demo` on the committed OpenAI build. `npm run demo` without the flag, with no OpenAI build present, exits 1 with a clear message. `npm start` serves on port 3000.

## 11. Known open questions

These are recorded so that a reviewer, or the next agent, decides them on purpose rather than by accident.

1. **Policy runs on volatility the model may have inferred.** *Resolved by the OpenAI build: Option A* (see Decisions).
   - When the source has no volatility, the service uses the guarded inferred value. A mechanic the model inferred (e.g. `bonus_buy`) can only make the rules stricter, but an inferred volatility *lower* than the truth can loosen the cap for one candidate. That sits uneasily with AGENTS.md rules 3 and 6.
   - **Option A** (kept): use the inferred value. The exhaustive ground-truth policy check (spec 02 §7) is the backstop, and it gates at 0 violations.
   - **Option B**: use source volatility only, so inferred counts as unknown and fails closed. Measured on the offline build, B lowers nDCG@5 from 0.549 to 0.463, raises the bad-recommendation rate from 0.606 to 0.665, and lowers coverage from 0.979 to 0.964. Blocking more candidates lets weaker ones in.
   - **The answer, from the committed OpenAI build** (index `ef13f1ecf784`, `eval/reports/latest.md`):
     - `policyViolations` is 0 in the exhaustive check's 2,260 calls, judged on the **true** volatility and stakes, so no inferred volatility loosened a cap;
     - the model inferred volatility for only 2 records, both correct (volatility accuracy when inferred: 1). The volatility fill rate moves only from 0.618 to 0.636.

     So A carries no measured risk here, and B's ranking cost buys nothing.
   - Still revisit if the ground-truth policy gate ever fails, or if compliance prefers B regardless of ranking cost.
2. **Feature flags as a supplier field.** Restricted features are currently carried as tags that degradation must not drop (spec 01 §7.4). A real integration should take them as a structured, authoritative compliance field.
3. **A curator golden set** to replace the silver relevance labels (spec 06 §3) before launch.

## Decisions

| Point | Decision | Why |
| --- | --- | --- |
| Embed or search per request | **No:** precompute top-40 neighbours at build time | The query is always a known game and the answer isn't personalised; no network hop, deterministic, cacheable |
| LLM in the request path | **No** | Latency budget, cost, non-determinism, and generated text on a regulated page |
| Vectors in the service artefact | **No** | The service never needs them; smaller artefact |
| Internal records in responses | **No:** the response is `{ gameId, seedTitle, brand, market, indexVersion, status, reason?, items: [{ gameId, title, score }] }` | Enrichment output, provenance and diagnostics are internal; nothing generated reaches a player (AGENTS.md rule 4) |
| Decline status code | **200** (404 only for unknown games) | A decline is a correct answer ("hide the rail"), not an error |
| Bad artefact at start-up | **Not ready, not a crash** | Keeps old instances serving during a bad rollout |
| One threshold for all embedders | **No:** a threshold per embedder; refuse an index without one | Similarity scales differ by model |
| Offline builds | **Separate, git-ignored folders.** `demo` and `eval` default to the OpenAI build and exit 1 if it's missing, never falling back | Keyless results must never be mistaken for, or committed as, the shipped build. A silent fallback would report stand-in numbers as if they were real |
| Where `IndexSchema` lives | **`src/domain/index-schema.ts`**, re-exported by `build-index.ts` | Importing it from `build-index.ts` would load the OpenAI SDK into the service, against rule 1 |
| Boundary test scope | **Includes `config.ts`'s path constants** | A file name check alone misses code that imports the constant |
| Error bodies and the request counter | **Specified** (§6.2, §7): one error shape; every request counted; unknown brands labelled `invalid` | Free-text label values would let any client grow the metric series without bound |
| Policy on inferred volatility (§11.1) | **Option A: use the guarded inferred value** when the source has none; the ground-truth policy gate is the backstop | On the OpenAI build, 0 policy violations in 2,260 calls against true volatility. Only 2 volatilities were inferred, both correct. Option B costs ranking quality offline (nDCG@5 0.549 → 0.463) for no measured safety gain. Revisit if the policy gate fails or compliance asks for B |
| Index-level `enrichment` | **Describes the build mode** | A build mixes `llm`, `skipped_complete` and `rules_fallback` records, so one record's method can't describe it |
| CI workflows | **Two: `check` (typecheck, tests, demo) and `release-gate` (`eval:gate`), with no `continue-on-error`** | Tests and evaluation answer different questions. One workflow would let a gate failure mask the tests' result, and invite tuning a gate to get CI green. A red release gate is a blocked release, reported as one |
| CI Node version | **22** | Full ICU and `process.loadEnvFile`. The dataset's formatting depends on ICU (spec 01 §11) |

### Compared with a common alternative design

A typical "production recommender" write-up proposes these. They were considered and decided as follows:

| Proposal | Here | Why |
| --- | --- | --- |
| Offline enrichment and embedding, online serving | **Same** | Rule 1 in AGENTS.md |
| Content-hash incremental ingest | **Same,** via the enrichment cache key (spec 04 §8), plus a pipeline version | Pay only for changed records; invalidate cleanly on a prompt, model or pipeline change |
| Evidence gate: skip rich records, abstain on opaque ones | **Same** (spec 04 §4) | Opaque records still go to the LLM, but are stored as low-trust and never recommended |
| Bounded concurrency, backoff with jitter, atomic writes, checkpointing | **Same** | Spec 04 §8, section 4.4 |
| Closed vocabulary and a post-LLM summary check | **Same,** with a stricter guard | Off-vocabulary tags are dropped and counted. A summary with banned language, a percentage or a money amount is discarded, not repaired |
| SQLite or a vector store, with cosine per request | **No:** a JSON artefact with precomputed top-40 neighbours | The query is always a known game: there's nothing to search at request time, and no store to operate |
| Hybrid score boosts (e.g. +0.04 same category, −0.08 cross-vertical) | **No:** hard rules instead of score nudges | "Similarity proposes, rules dispose": a boost can be outweighed, but a rule can't. Category and volatility are matched through the embedding text and the policy layer |
| Fall back to brand-popular games when the seed has no evidence, or too few candidates | **No:** decline and hide the rail | Rule 7 (decline over pad): popular games under a "Because you played X" heading would be unrelated |
| `matchReasons` in the response | **No** (diagnostics are logged instead) | Explanations of the model's features on a player surface are generated content. Reasons stay in logs and the evaluation report |
| Admin `POST /ingest` on the serving API | **No** | Ingestion is a build step, and the service is read-only. A bad build can't affect live instances until it's deployed, and an index that fails validation is never served |
| Seed game deprecated or unlicensed | **Decided explicitly:** unlicensed or test → `SEED_NOT_AVAILABLE` decline; withdrawn or out of season → still recommend eligible alternatives (spec 02 §6.2) | Recorded in the ADR |
| Missing or invalid artefact at start-up | **Not ready (503 on `/ready` and the route)**, no crash, no fallback matching | A deterministic fallback would serve unevaluated rankings on a regulated page |
