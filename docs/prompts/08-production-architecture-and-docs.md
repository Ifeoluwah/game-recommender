# Spec 08: production architecture (ADR), evaluation write-up, README and Part B

> **How to use this spec.** `Read @AGENTS.md and implement @docs/prompts/08-production-architecture-and-docs.md`.
> Specs 01–07 define what runs. This spec defines the documents that explain it and the reusable artifact for Part B of the brief. It describes the system that specs 01–07 build, so implement it last.
> Where this spec and `AGENTS.md` disagree, `AGENTS.md` wins. Flag the conflict rather than guessing.
>
> **Provenance.** The design here was worked out on the prototype (see `docs/prompts/README.md`), whose documents this spec was written from. Writing it found two places where those documents had drifted from the code (see Decisions), which is why section 8 exists.

## 1. Goal

A reviewer should be able to understand the production design, its limits and how it would grow, without reading code. Every claim in the documents must match the code. A test checks the parts that can drift.

## 2. Deliverables

| Path | What |
| --- | --- |
| `docs/ADR-001-recommender-architecture.md` | Stage 5 of the brief: the architecture decision record with a diagram (section 3), including spec 07 §3.6's seed-availability rows |
| `docs/EVALUATION.md` | The evaluation design in prose (section 4; metrics defined in spec 06). Completes the first version written in spec 06 |
| `README.md` | Entry point (section 5). Extends the README spec 03 created, keeping its "Dataset design" section |
| `docs/AI_USAGE.md` | AI tools and every agentic artifact (section 6) |
| `.claude/skills/productionise-ai-prototype/SKILL.md`, `templates/ADR.md` | Part B: the reusable skill (section 7). **Already in the skeleton:** check both against sections 7 and 8.5, and change them only to fix a mismatch |
| `docs/LEVERAGE.md` | Part B: why this artifact, and how it applies to the next prototype (section 7) |
| `tests/docs.test.ts` | Consistency checks (section 8) |

## 3. The ADR

**Title:** "ADR-001: Precompute related games offline, serve them from a lookup service". **Status:** Proposed (first production step), with the context date.

### 3.1 Sections, in order

1. **Context.** The product ask (a "Because you played X" rail on a regulated real-money site, several brands and markets, a latency budget, a changing catalogue), plus the three facts that drive the design:
   - the output is item-to-item, so it can be precomputed and cached;
   - AI steps are slow, costly and non-deterministic;
   - the surface is regulated, so a wrong game is a compliance problem, and generated text shown to players is an unnecessary risk.
2. **Decision.** Split at build time (all AI) vs request time (no AI).
   - **Build:**
     - a catalogue event triggers normalise, then the evidence check (spec 04 §4);
     - complete records skip the LLM; partial and title-only records go to it, with title-only results stored as low-trust and flagged insufficient;
     - then the guarded enrichment, embedding and top-40 neighbours;
     - then **the evaluation as a release gate**; only a passing artefact is published, versioned and immutable.
   - **Request:** a stateless service walks the neighbours through the four layers (spec 02 §2), stated with the real numbers:
     - one volatility step up;
     - max bet ≤ 5× and minimum bet ≤ 10× the seed's;
     - unknown volatility or stakes fail closed.

   "Similarity proposes; rules dispose." Players see source titles only, never generated text.
3. **Diagram:** a Mermaid `flowchart LR` with two subgraphs.
   - **Build time:** CMS → EventBridge → Step Functions → Normalise → Evidence check. From the check, *partial / title-only* goes to Enrich (Bedrock, guard, cache) and *complete* goes straight to Embed + top-K. Then the eval gate: pass → S3 (versioned index + `current` pointer); fail → alert, keep the current index.
   - **Request time:** S3 → the service (ECS Fargate, in memory), with CloudFront in front.
   - **Lobby:** calls `GET /v1/games/:id/related` through the CDN. A dotted edge shows `x-player-restricted: true` bypassing the cache.
4. **Infrastructure (AWS)** table:

   | Concern | Choice |
   | --- | --- |
   | Trigger | EventBridge on catalogue changes, plus a nightly full rebuild |
   | Orchestration | Step Functions, stages as Lambdas (Fargate tasks when large) |
   | Models | Bedrock in production (data stays in account and region); OpenAI in the exercise, behind an interface |
   | Artefact | Versioned, immutable S3 objects; `current.json` pointer is the only mutable object (one-write promote and rollback) |
   | Serving | ECS Fargate, ≥ 2 tasks across AZs behind an ALB; CloudFront for unrestricted responses |
   | Config | Kill switches and thresholds in AppConfig (a JSON file here) |
   | Observability | Structured logs and CloudWatch metrics (outcome, decline reason, latency, index version), plus pipeline metrics. Logs carry no player data (spec 07 §3.5) |

5. **Alternatives considered**, each with "why not (for now)":
   - **Per-request embedding search** (e.g. OpenSearch k-NN): an extra network hop and a stateful cluster, when the query is always a known game.
   - **LLM in the request path:** latency, non-determinism, can't be cached, and generated text on a regulated page.
   - **Static JSON on S3/CloudFront with no service:** credible, but the safer-gambling flag, kill switch and threshold tuning would need a rebuild or client logic. Name it as the fallback if the team can't own a service.
   - **API Gateway + Lambda:** a close call; Fargate wins on steady p99 and loading the artefact once per task.
   - **A vector DB as the store of record.**
   - **A fine-tuned or classical model instead of the LLM:** the `rules_enriched` baseline exists to make that call.
6. **Trade-offs we accept:**
   - freshness lag;
   - **eligibility is snapshotted with the index.** Name this as the main known gap, with the priority-rebuild mitigation and the eligibility overlay as the next step;
   - thresholds are tied to the embedder;
   - silver labels;
   - exact O(n²) neighbours.
7. **Failure behaviour: what a player sees.** Lead with "in every failure case the player sees the page without the rail". Then one row per case, as a table of failure | system behaviour | player sees:
   - service slow or down (client timeout, e.g. 30 ms);
   - **every decline reason** in `recommender.ts`, including the 400 for a market the brand doesn't serve;
   - a withdrawn or out-of-season seed (not declined, on purpose);
   - the most similar game ineligible (filtered);
   - a bad index at start-up (`/ready` 503; old tasks keep serving);
   - an LLM outage during a build (per-record fallback; the gates decide);
   - an embedding outage or a failed gate (nothing published);
   - a bad index published anyway (roll back the pointer).
8. **Scaling.** Note that the service is stateless and CPU-only, and the CDN absorbs most traffic. Then a trigger → action table:

   | Trigger | Action |
   | --- | --- |
   | p99 > 10 ms or CPU > 60% | Add tasks |
   | CDN hit rate < 90% | Review cache keys and TTL |
   | > ~20k games or build > 15 min | Approximate nearest neighbours at build time; shard by brand |
   | Artefact ~hundreds of MB | Neighbours to DynamoDB or ElastiCache |
   | Enrichment cost or time grows | Batch inference API (the cache and evidence check already limit work) |
   | Many brands with different rules | Per-brand eval slices |

9. **Evidence that would make us revisit**, each naming the alternative it would lead to:
   - an A/B test shows the rail doesn't beat "popular in the same category" (with safer-gambling guardrails);
   - the LLM doesn't beat the rules enricher;
   - a golden set disagrees with the silver labels;
   - compliance needs live eligibility;
   - product wants personalisation;
   - build lag becomes visible.

## 4. `docs/EVALUATION.md`

Sections:
- **Intro.** Tests check behaviour, the evaluation checks AI quality; a table of the four layers plus ranking.
- **Reference data.**
- **Stage 1: LLM enrichment.** What good means, and the metrics.
- **Stage 2: semantic matching.**
- **Planted traps.**
- **Benchmark clusters.**
- **Policy thresholds.** The real numbers, that they're product and safer-gambling policy choices rather than regulation, and the two fail-closed findings (volatility found by the evaluation, stakes found by the rebuild test).
- **Release gates.** A table generated from `eval/release-gates.json` (layer, gate key, rule, why), and the honest note about the one label revision.
- **Known limitations.** Labels and catalogue share an origin; the golden set to collect; online A/B testing; the small catalogue.

The failure-analysis section (a few concrete cases where the system is wrong, returns something it shouldn't, or rightly declines) is **written from the OpenAI build's report**. It's deferred until that run, and must quote real records from it.

## 5. README

Sections:
1. A one-paragraph summary: the build-time vs request-time idea.
2. The four-layer table, with the real numbers.
3. A "read this" table linking the ADR, `EVALUATION.md`, the latest report, `LEVERAGE.md`, `AI_USAGE.md`, `docs/prompts/` and `AGENTS.md`.
4. "Run it (no API key needed)": the offline commands with `--provider=offline`, including that offline builds go to the git-ignored `data/offline/`, `artifacts/offline/` and `eval/reports/offline/`, and that `demo` and `eval` read the committed OpenAI build unless given the flag. Then the API section: routes, parameters, response shape, decline reasons and an example.
5. "Rebuild with a model": the OpenAI commands, committing the result, and that only `text-embedding-3-small` has a score threshold (spec 05 §6.3).
6. "Dataset design" (spec 03 §8).
7. "How the pieces fit": an ASCII pipeline sketch.
8. "Production concerns: what I built and what I left out". The built list, plus a left-out table with a reason per item: auth and rate limiting at the edge, hot reload, vector DB, live eligibility overlay, age checks, a "trending" fallback rail, personalisation and A/B, review UI, IaC, and a generated spec appendix with a drift check. The last one's reason: the excerpts are fragments of files, so generating them needs markers in production code or brittle parsing; the appendix is maintained by hand, and the identity hash already checks the dataset (spec 07 Decisions).
9. Repository map.

## 6. `docs/AI_USAGE.md`

- **Tools:** the coding agent, and the models inside the product.
- **Agentic artifacts:** every one, with its purpose: `AGENTS.md`, `CLAUDE.md`, `docs/prompts/` (including the hand-maintained appendix), the skill, the versioned runtime prompts, the gates file and CI.
- **"How it was built":** state the process accurately: the specs were developed against a prototype, checked by fresh-agent rebuilds, and this repo was then built from them spec by spec (`docs/prompts/README.md`). Leave the **"Division of work"** section as a marked placeholder **for the candidate to write**. An agent must not fill in claims about what the human did.

## 7. Part B: the reusable skill and `LEVERAGE.md`

**`SKILL.md`:**
- Front matter: `name: productionise-ai-prototype`, and a `description` saying when to use it.
- Nine numbered steps, each written as an instruction with its default move:
  1. Map the AI stages: inputs and outputs, who sees them, where they run, latency and cost, failure. The default is to move to build time anything that doesn't need per-request input.
  2. Name the protected fields and the hard rules: deterministic, after the model, failing closed.
  3. Put a guard between every model and its consumers: schema plus closed vocabulary, source wins, free-text lint, per-field provenance, per-record fallback, untrusted input.
  4. Define "good" per stage, with reference data and metrics, and say which labels are silver vs gold.
  5. Write the gates as data before looking at results, and make `--gate` block publishing.
  6. Make declining a first-class outcome: reason codes, the client hides the feature, a test per code.
  7. Version everything a result depends on, with content-addressed caches.
  8. Keep an offline path.
  9. Write the ADR from the template.
- **"Done when":** `PRODUCTIONISATION.md` covers steps 1–8, the ADR exists, and CI runs typecheck, tests and gates with no key.

**`templates/ADR.md`:** the section skeleton from section 3.1 (Status, Context, Decision with a diagram, Alternatives, Trade-offs, Failure behaviour from the end user's view, Scaling triggers, Revisit evidence).

**`docs/LEVERAGE.md`:**
- **What the artifact is.**
- **Why a skill, not code:** the next prototype won't be a recommender; what transfers is the *sequence of decisions*. It's plain Markdown that people can challenge, and agents pick it up automatically.
- **How it applies to the next prototype:** what the owner still decides.
- **What to add next:** a gates schema and a generic gate runner.

## 8. Consistency checks (`tests/docs.test.ts`)

1. The ADR names every `DeclineReason` in `src/service/recommender.ts`, in backticks.
2. `EVALUATION.md` names every gate key in `eval/release-gates.json`.
3. The ADR has every section in 3.1 and a Mermaid block.
4. Every relative link in the README, ADR, `EVALUATION.md`, `LEVERAGE.md`, `AI_USAGE.md` and `docs/prompts/README.md` resolves to a file or folder. One exception: links into `eval/reports/` (the OpenAI report) may be missing until the first OpenAI build is committed. The test then skips them and logs them as pending, rather than failing offline.
5. The skill has its front matter, steps 1–9 and the template.

Prose accuracy beyond these checks (numbers, behaviour) is a review item: when a spec changes a rule, update the README's layer table, the ADR's Decision section and `EVALUATION.md`'s policy section in the same change.

## 9. Constraints

- **No invented results.** Numbers in the docs come from a real report and say which build they came from (offline or OpenAI).
- **Fictional names only;** no real operators, studios or brands.
- **No claims about the candidate's own work.** These are left to the candidate (section 6).
- Infrastructure is **described, not built:** the brief asks for no IaC.

## 10. Acceptance criteria

1. `tests/docs.test.ts` passes, and so do all the other tests.
2. The ADR's Decision section, the README's layer table and `EVALUATION.md`'s policy section state the same numbers as `config/service.json` and spec 02 §6.2.
3. The Mermaid diagram renders (GitHub, or `mmdc`), with the evidence-check edges as in 3.1.
4. The failure-analysis section is either present with real cases from the OpenAI report, or explicitly marked as pending that run.

## Decisions

| Point | Decision | Why |
| --- | --- | --- |
| One ADR or several | **One** for this first step, with a reusable template in the skill | One decision (where AI runs) drives everything; more ADRs would follow real changes |
| Name AWS services | **Yes,** concretely, with the exercise's substitutes (OpenAI, a JSON config) named | The brief asks for chosen infrastructure; vague "cloud" answers can't be challenged |
| Bedrock vs OpenAI in production | **Bedrock** | Data residency inside the account; the provider sits behind an interface either way |
| Static S3/CDN with no service | **Rejected, but named as the fallback** | It's credible; being honest about the close call is more useful than overselling |
| Failure table framed from the player's view | **Yes** | The brief asks for "failure/fallback behaviours for players"; "page without the rail" is the answer in every row |
| Part B as a skill rather than a library | **Skill** | What transfers to the next prototype is the decision sequence, not recommender code |
| Docs consistency test | **Added with this spec** | Writing the spec found drift: the ADR still said title-only records skip the LLM (changed by option B in spec 02), the policy summaries omitted the min-bet and unknown-stakes rules, and the market-not-served decline wasn't in the failure table. All fixed; the test now catches the checkable kinds |
| Failure analysis now or after the OpenAI run | **After** | It must quote real cases from the configuration being submitted |
| Links to the OpenAI report before it exists | **Skipped and logged** by the docs test, not failed | Offline reports are git-ignored, so the committed report is the OpenAI one. Tests must pass with no key |
| Spec appendix exporter | **Not built;** listed under "left out" in the README | See spec 07 Decisions |
