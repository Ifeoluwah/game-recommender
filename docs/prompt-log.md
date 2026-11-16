# Prompt log

## 2026-11-16 00:29:51

<pasted_content id="2fae">
Read @AGENTS.md, @START_HERE.md, @docs/prompts/README.md and specs 01 through 08 in order, checking @docs/prompts/appendix-reference-values.md where referenced.

Don't write any application code. Write docs/plan.md containing:
1. An implementation checklist with one milestone per spec.
2. The exact files each milestone creates or modifies.
3. The tests and verification commands for each milestone, in Windows PowerShell.
4. Each milestone's acceptance criteria, copied word for word from the specs.
5. A section flagging anything in the specs or appendix that looks ambiguous, contradictory or underspecified, each with a proposed resolution. Name the flags P-1, P-2 and so on.

Don't commit anything.
</pasted_content id="2fae">

## 2026-11-16 00:41:54

<pasted_content id="2fae">
Resolutions. Accept as proposed: P-1, P-5, P-8, P-9, P-11, P-15, P-16, and every flag I don't name below.

Changed:
- P-6: drop the appendix exporter entirely. Remove npm run spec:appendix and its --check from START_HERE, spec 07's deliverables and acceptance criteria, and from package.json; remove the appendix header line about a drift test; in spec 08 §5 list it in the README's "what I left out" with the reason. No region markers.
- P-7: keep the code's behaviour and correct the stale comment now, in this pass.
- P-32: offline builds write to data/offline/, artifacts/offline/ and eval/reports/offline/, all git-ignored; the committed build is the OpenAI one. demo and eval default to the OpenAI build and exit 1 with a clear message if it's missing, never falling back silently. Update specs 01, 05, 06, 08 and START_HERE.
- P-8: try JSON.stringify(value, null, 2) + "\n" first, with the trailing newline, and keep offline generation out of sanitiseCreative. Record whichever reproduces the hash.

Fix each flag in the spec or appendix text it belongs to, with a Decisions row where it changes behaviour, and update docs/plan.md to match. The specs stay the source of truth. Create REBUILD_NOTES.md with one line per flag saying where it was resolved. Don't write application code. Don't commit.
</pasted_content id="2fae">

## 2026-11-16 00:54:59

List all flags in a table : flag, one line problem, proposed reoslution, affected milestone

## 2026-11-16 01:01:09

Read @AGENTS.md and implement @docs/prompts/01-dataset-spec.md, following milestone 1 in @docs/plan.md and the resolutions in @REBUILD_NOTES.md. Where the appendix gives exact code or values, use them exactly. Write the tests the spec requires, run npm run typecheck and npm test, then run npm run generate -- --provider=offline. Build and run everything offline; write the OpenAI path but don't run it. Tick milestone 1 off in docs/plan.md and record any new choices in REBUILD_NOTES.md.

 Finish by reporting: the test results, the catalogueHash of data/offline/catalogue.raw.json and whether it matches what the specs expect at this point, and anything in the spec you had to interpret.

## 2026-11-16 01:18:29

Read-only: does the normaliser map "uk" to "gb"?some feed records use "ES;UK;NL;SE" while others use GB in arrays

## 2026-11-16 01:20:45

Read @AGENTS.md and implement @docs/prompts/02-guardrail-layers-and-compliance-traps.md, following milestone 2 in @docs/plan.md and the resolutions in @REBUILD_NOTES.md. Where the appendix gives exact code or values, use them exactly. Write the tests the spec requires, run npm run typecheck and npm test, then run npm run generate -- --provider=offline. Build and run everything offline; don't run the OpenAI path. Tick milestone 2 off in docs/plan.md and record any new choices in REBUILD_NOTES.md.

Finish by reporting: the test results, the catalogueHash of data/offline/catalogue.raw.json (expected 5caf2bbb0f343546 now that traps are added), the counts of canonical games and feed records, and anything you had to interpret.

## 2026-11-16 01:32:25

Read @AGENTS.md and implement @docs/prompts/03-benchmark-clusters-and-evaluation-dimensions.md, following milestone 3 in @docs/plan.md and the resolutions in @REBUILD_NOTES.md. Where the appendix gives exact code or values, use them exactly. Write the tests the spec requires, run npm run typecheck and npm test, then run npm run generate -- --provider=offline. Build and run everything offline; don't run the OpenAI path. Tick milestone 3 off in docs/plan.md and record any new choices in REBUILD_NOTES.md.

Don't commit; I make the commits. Finish by reporting: the test results, the offline catalogueHash (must still be 5caf2bbb0f343546), the manifest's evaluation_dimensions summary, and anything you had to interpret.
