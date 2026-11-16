# Start here: build the game recommender from its specs

This folder is a **skeleton**. It holds the specs, the agent rules and the package setup, but no code. The specs come first here: the agent builds everything from them. (How the specs were developed, and checked, is in `docs/prompts/README.md`.) Give it to a coding agent and it builds the whole project:
- the dataset, pipeline, service, tests and evaluation;
- the ADR and docs;
- the Part B skill.

| What's here | Why |
| --- | --- |
| `docs/prompts/01–08-*.md` | The specs, in build order. `docs/prompts/README.md` says what each one drives |
| `docs/prompts/appendix-reference-values.md` | Exact constants, word lists and draw order, so the keyless dataset comes out byte for byte the same |
| `AGENTS.md` | The rules every agent follows (no model calls at request time, fail closed, and so on) |
| `CLAUDE.md` | Claude-specific notes; imports `AGENTS.md` |
| `package.json`, `package-lock.json`, `tsconfig.json` | Pinned dependencies and the npm scripts the specs expect |
| `.gitignore`, `.env.example` | Keeps keys and caches out of git |
| `prompts/*.v2.md` | The two runtime prompts the finished system sends to the model (catalogue generation, enrichment). Given as is, so the OpenAI build uses reviewed prompts rather than ones the agent writes |

## 1. Set up

```bash
npm ci          # Node 20+
git init && git add -A && git commit -m "Skeleton: specs and agent rules"
```

You don't need an API key. Everything builds and runs offline.

## 2. Build it in small loops

Don't ask the agent to one-shot the whole thing. Even with a thorough spec, a single prompt that builds everything tends to leave subtle bugs. Three steps instead.

**Step 1: plan.** Have the agent read everything and write a checklist before it writes code:

> Read @AGENTS.md, then read `docs/prompts/README.md` and specs 01–08 in order. Don't write any code yet. Write `docs/plan.md`: a step-by-step implementation checklist, one milestone per spec, with the files each milestone creates, the tests it must add, and the acceptance criteria that prove it's done (copied from the spec). Flag anything in the specs that looks ambiguous or contradictory.

Read the plan. Fix anything it flagged in the specs before going on, so the spec stays the source of truth.

One thing the planner will notice: milestones 1–3 (specs 01–03) are one body of code. The appendix excerpts for the dataset already contain the clusters and the trap options, so the agent may build 01–03 together and tick all three. That's fine; commit after each spec's acceptance criteria pass anyway.

**Step 2: one milestone at a time.** For each spec, in order:

> Read @AGENTS.md and implement @docs/prompts/01-dataset-spec.md, following milestone 1 in `docs/plan.md`. Where the appendix gives exact code or values, use them exactly. Write the tests the spec requires, run `npm run typecheck` and `npm test`, and tick the milestone off in `docs/plan.md`. Build and run everything offline; write the OpenAI paths as specified but don't run them. Where the spec is silent, make the most reasonable choice and record it in `REBUILD_NOTES.md`.

Check the acceptance criteria yourself, then commit:

```bash
git add -A && git commit -m "Spec 01: dataset generation"
```

A commit per working milestone gives you a clean rollback point if a later one goes wrong. Then 02, 03 … 08.

**Step 3: the full check.** After spec 08:

> Run `npm run generate -- --provider=offline`, `npm run build:index -- --provider=offline`, `npm run demo -- --provider=offline` and `npm run eval -- --provider=offline`. Compare the results with section 3 of `START_HERE.md` and report every difference.

Offline builds go to `data/offline/`, `artifacts/offline/` and `eval/reports/offline/`, all git-ignored. The committed build is the OpenAI one in `data/generated/`, `artifacts/` and `eval/reports/` (section 4). Without `--provider=offline`, `demo` and `eval` read the OpenAI build. Until it exists, they exit 1 and say so; they never fall back to the offline build. On Windows PowerShell the same commands work as written. Pass `--provider=offline` explicitly whenever a `.env` file exists, because `generate` and `build:index` choose OpenAI when a key is set.

**The prototype as a reference.** You don't need the prototype's code: `docs/prompts/appendix-reference-values.md` already holds the tricky parts as exact excerpts (the PRNG and draw order, degradation, traps, normalisation, the policy rules, the relevance labels). That's what makes the dataset reproducible. If the agent gets stuck on something the appendix doesn't cover, add the relevant snippet to the appendix rather than pasting it into chat, so the spec stays complete.

## 3. What a correct build looks like (offline)

- **Typecheck and tests:** typecheck is clean and all tests pass.
- **Dataset:** 108 canonical games and 113 feed records. The slate mix is 70 slot, 9 table, 9 live, 7 instant win and 5 bingo, with 4 benchmark clusters.
- **Planted traps:** "39/39 handled correctly".
- **Identity check:** the feed's `catalogueHash` in `artifacts/offline/index.json` is `5caf2bbb0f343546`. If it matches, the dataset is byte for byte the prototype's and every number below will match too. If it doesn't, check the file serialisation first (spec 01 §10). Then look at the draw order in the appendix (A1, A3, A5–A8).
- **Clusters (raw text → enriched):** Recall@5 0.825 → 0.800, MRR 1 → 1, near-miss intrusion 0.15 → 0, served Recall@5 0.613 → 0.600.
- **Gates:** information, eligibility, policy and abstention pass, including coverage (1.0, gate ≥ 0.8). The exception is theme precision (0.667), which spec 06 expects to fail offline.
- **Ranking gates fail, as expected without a model:** nDCG@5 0.497, lift over raw text −0.026, bad-recommendation rate 0.663.
- **Why served recall, coverage and the ranking numbers differ from the prototype's** (0.863 → 0.850; 0.979; 0.549 / −0.026 / 0.606): this build's rail also skips a game with the same displayed name as the seed or an accepted item (spec 02 §6.2, `quality:duplicate_title`). With that rule switched off, the evaluator reproduces the prototype's values exactly. See `REBUILD_NOTES.md`, "Baselines superseded". Everything computed before `recommend()` (cluster Recall@5, MRR, intrusion, theme precision, the traps, the hash) is unchanged.
- **`npm run eval:gate` and `npm run check` exit 1** until you build with OpenAI. They gate the committed OpenAI build, so before it exists they stop with a "no OpenAI build" message. `npm run eval:gate -- --provider=offline` also exits 1, on the ranking gates.

Keep this file, or fold it into the README: it's part of the record of how the repo was built.

## 4. Then, with an OpenAI key

```bash
cp .env.example .env   # add OPENAI_API_KEY
npm run generate -- --provider=openai
npm run build:index -- --provider=openai
npm run eval
```

1. Tune the score threshold from the sweep in `eval/reports/latest.md`; never tune the gates.
2. Commit the OpenAI build (`data/generated/`, `artifacts/`, `eval/reports/`), so CI gates it. CI fails until this is committed.
3. Two things are left for you, not the agent:
   - the "division of work" section in `docs/AI_USAGE.md`;
   - the failure-analysis section in `docs/EVALUATION.md`, written from the OpenAI report's real cases.
