# Leverage: the reusable artifact (Part B)

## What the artifact is

A Claude Code skill, [`.claude/skills/productionise-ai-prototype/`](../.claude/skills/productionise-ai-prototype/), with an ADR template.
- [`SKILL.md`](../.claude/skills/productionise-ai-prototype/SKILL.md) is nine numbered steps for taking any R&D prototype with a model in it towards production. Each step is an instruction with a **default move**: take it unless you can say why this prototype is different.
- Working through the steps produces `PRODUCTIONISATION.md` and an ADR from [`templates/ADR.md`](../.claude/skills/productionise-ai-prototype/templates/ADR.md).

The nine steps:
1. Map the AI stages, and move to build time anything that doesn't need per-request input.
2. Name the protected fields and the hard rules, which are deterministic, run after the model and fail closed.
3. Put a guard between every model and its consumers.
4. Define "good" per stage, with silver and gold labels.
5. Write the gates as data before looking at results.
6. Make declining a first-class outcome.
7. Version everything a result depends on.
8. Keep an offline path.
9. Write the ADR.

This repo is the worked example: every step maps to something here (the table below).

## Why a skill, not code

- **The next prototype won't be a recommender.** It might be a support-ticket classifier, a document extractor or a fraud scorer. Almost none of this repo's code transfers. What transfers is the **sequence of decisions** that made it safe to ship: where the model runs, what it may never write, what checks its output, what "good" means and who sets the bar, when to say nothing.
- **It's plain Markdown that people can challenge.** A reviewer can disagree with a default in one line of a pull request, which is harder with a library's behaviour.
- **Agents pick it up automatically.** The skill's description says when it applies, so a coding agent asked to "productionise this prototype" loads it without being told. [`CLAUDE.md`](../CLAUDE.md) points to it too.

## How it applies to the next prototype

What the skill gives for free: the order of the questions, a default answer to each, and the template.

| Step | What it produced here |
| --- | --- |
| 1. Map the AI stages | All AI at build time (ADR §2); the request path has no model (AGENTS.md rule 1) |
| 2. Protected fields and hard rules | `normalise.ts` owns the protected fields; layers 2 and 3 in `recommender.ts`, failing closed |
| 3. A guard | `guard.ts`: closed vocabulary, source wins, summary lint, provenance, per-record fallback |
| 4. Define "good" | `eval/`: silver labels, planted traps, benchmark clusters, an oracle and baselines (`EVALUATION.md`) |
| 5. Gates as data | `eval/release-gates.json` and `npm run eval:gate` |
| 6. Declining | The `DeclineReason` codes, a test for each; the page hides the rail |
| 7. Versioning | Versioned prompts, content-addressed cache, `indexVersion`, schema-checked artefacts |
| 8. Offline path | `--provider=offline`, in git-ignored folders |
| 9. The ADR | [`ADR-001`](ADR-001-recommender-architecture.md) |

**What the owner still decides,** and the skill marks *owner decides*:
- the policy numbers (here, the volatility step and stake multipliers), with compliance;
- the gate thresholds, before seeing results;
- the infrastructure, where the organisation has a standard;
- whether a failing gate blocks the release. On this build it does: the lift gate fails, and the docs say the build shouldn't ship.

**What this build taught the skill.** Two lessons from here are general enough to add to step 4. They aren't in `SKILL.md` yet, because spec 08 changes the skill only to fix a mismatch:
- **Report a metric per slice, not only overall.** A whole brand (liberty/NJ) lost every rail behind healthy overall numbers (step 4).
- **Don't let an oracle obey the rule it's judging.** That made gated coverage read 1.0 where the honest figure is 0.843 (step 4 again).

## What to add next

- **A gates schema and a generic gate runner.** Gates are data in every project that follows step 5, but each project re-implements the pass/fail decision and the "n/a fails" rule. A small schema-validated runner (`gates.json` in, exit code and table out) would make step 5 a one-liner.
- **Per-slice reporting in the template.** A required table for each segment the product serves (brand, market, language), with a check for slices where every answer is a decline.
