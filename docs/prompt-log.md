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

## 2026-11-16 01:39:26

<pasted_content id="2fae">
npm run generate -- --provider=openai failed: slots 30 and 45 share title "Bandit Ridge: Outlaw's Bounty" by Northlight Interactive. Batches of 10 can't see each other's titles, so cross-batch collisions will recur with a real model.

Fix: after all batches, find title+studio collisions. For each, regenerate only the later slot with a single-slot call whose user message adds "Titles already used (do not reuse): ..." listing every title so far, then run it through the same repair steps. Up to 3 attempts per slot, then fail with the current message naming the slots. Don't edit the prompt file in prompts/. Record the repaired slots in the manifest so the repair is visible.

Add a test with a fake JsonLlm that returns a duplicate title first and a unique one on retry. The offline catalogueHash must stay 5caf2bbb0f343546. Record the spec gap in REBUILD_NOTES.md. Don't run the OpenAI path; I'll rerun it. Don't commit; I make the commits.
</pasted_content id="2fae">

## 2026-11-16 01:46:50

<pasted_content id="2fae">
Inspect the OpenAI build in data/generated/ (read-only; don't change any data file and don't call any model). Check it against specs 01–03 and report pass/fail for each:
1. Counts: 108 canonical games, 113 feed records, and the slate type mix.
2. The manifest names the model and prompt version, and lists titleRepairs.
3. Slate contract on every game: primary theme first, forced mechanics and volatility exact, ranges clamped, series share a studio, no jackpot network without progressive_jackpot.
4. Benchmark clusters: 4 clusters, 5 members + 2 near-misses each, 5 distinct studios per cluster, no repeated titles within a cluster, members share the theme and exact mechanics.
5. No duplicate title+studio; all themes and mechanics in the vocabulary; every layout fits its game type; no live_dealer on a non-live game.
6. Traps and edge cases: the trap counts, and every spec 01 §7.3 edge case present at its expected count.
7. Quality spot-check: 5 random descriptions plus every misleading-title game. Does the copy match the true game type and metadata? Flag any that state RTP, max win or money amounts.

Then say whether it's fit to commit, and list anything that would affect enrichment or matching later. Save the findings to docs/notes/openai-catalogue-inspection.md. 
</pasted_content id="2fae">

## 2026-11-16 01:53:12

<pasted_content id="2fae">
Fix the inspection findings. Spec first, then code (AGENTS.md).

Generation (LLM path only, so the offline catalogueHash must stay 5caf2bbb0f343546):
1. Title uniqueness: also treat a repeated title among benchmark-cluster games as a collision, whatever the studio, and repair it with the existing loop. Reason: titles go into the embedding text, so duplicate titles inside a cluster corrupt cluster recall.
2. live_dealer: remove it from any game whose type isn't live; record it in the manifest repairs.
3. Layout fit: a layout that contradicts the game type (reel/lines/ways/Megaways on a non-slot, a non-reel layout on a slot) is regenerated via the repair loop; a missing or placeholder layout on a non-slot becomes null deterministically with a repair recorded; on a slot it's regenerated.

Service (spec 02):
4. Add the normalised title to the dedupe key, so a rail never shows two games with the same displayed name even when the studios differ. Product reason: players see titles. Add a test, and a Decisions row.

Record as known limitations in REBUILD_NOTES.md, with reasons, for the README and EVALUATION.md later: win-promise copy left as realistic input for the guard; metadata that contradicts its own copy, which will appear as wrong fills; and the "Wheel"/"Jackpot" keyword mappings from the appendix.

Add tests with a fake JsonLlm for 1–3. Don't run the OpenAI path; I'll rerun it.
</pasted_content id="2fae">

## 2026-11-16 02:05:23

Keep the title dedupe rule as a service rule applying to both builds. Don't scope to openai. Record in Rebuild_note.md that START_HERE §3's offline ranking and cluster numbers are a prototype baseline that this build supersedes, because the display-title dedupe changes what's served; they'll be re-baselined from this build's own first offline eval at milestone 6, with the reason noted. The hash, trap count and eligibility/policy gates stay as the expected values.

## 2026-11-16 02:08:15

Split the "Baselines superseded" list. Keep as expected values, because the display-title dedupe doesn't touch them: cluster Recall@5, MRR, near-miss intrusion, theme precision, game-type accuracy. Re-baseline only what the recommender serves: served Recall@5, nDCG@5, lift over raw text, bad-recommendation rate, coverage. Say why each group falls where it does.

## 2026-11-16 02:09:14

Also compare against docs/notes/openai-catalogue-inspection.md: which problems from the previous inspection are fixed, which remain, and anything new. Append a dated section to that file rather than overwriting it.

## 2026-11-16 02:11:53

<pasted_content id="2fae">
Read-only re-check of data/generated/ after the repair fixes; change no data file and call no model.
1. Counts and type mix still correct; manifest lists 14 repairs across the four kinds.
2. No repeated title within any benchmark cluster, whatever the studio.
3. No live_dealer on a non-live game.
4. Every layout either fits its game type or is null. Include the case you said the rule doesn't catch: a card game on a "single-zero wheel".
5. Anything new that the previous inspection didn't flag.
Append a dated section to docs/notes/openai-catalogue-inspection.md with the result and say whether it's fit to build on. Don't commit.
</pasted_content id="2fae">

## 2026-11-16 02:15:07

<pasted_content id="2fae">
Only one generator change: real-world names. Add a deny-list check to the repair loop (spec 01 §6.2): a title matching a known real brand, game franchise, film or TV title (case- and punctuation-insensitive, whole tokens) is regenerated with an instruction not to use real-world names, up to 3 attempts, then fail naming the slot. One module, a comment saying the list isn't exhaustive, the limitation recorded in REBUILD_NOTES.md, and a test. Report which of this run's titles it catches.

Record the rest in REBUILD_NOTES.md as deliberately kept, with reasons, for the README and EVALUATION.md:
- card games and game shows on wheel layouts, table copy that still says live dealer, metadata contradicting its own copy, games left with no mechanics: realistic supplier-feed mess, which the pipeline and evaluation exist to handle; tidying it would make the dataset less representative;
- one misleading-title trap is vacuous this run because the model stated the true type in the title, so EVALUATION.md must disclose that 39/39 includes a row that proves nothing;
- near-duplicate titles pass the exact-match display-title dedupe; fuzzy matching is out of scope.
</pasted_content id="2fae">

## 2026-11-16 02:24:21

Read @AGENTS.md and implement @docs/prompts/04-enrichment-and-guard.md, following milestone 4 in @docs/plan.md and the resolutions in @REBUILD_NOTES.md. Where the appendix gives exact code or values, use them exactly. The prompt file in prompts/ is given; don't edit it. Write every test in spec 04's acceptance criteria using a fake JsonLlm, then run npm run typecheck and npm test. Build and run everything offline; write the OpenAI path but don't run it. The offline catalogueHash must stay 5caf2bbb0f343546. Tick milestone 4 off in docs/plan.md and record any new choices in REBUILD_NOTES.md.

Finish by reporting the test results, which acceptance criterion each test covers, and anything you had to interpret.

## 2026-11-16 02:26:19

Read @AGENTS.md and implement @docs/prompts/04-enrichment-and-guard.md, following milestone 4 in @docs/plan.md and the resolutions in @REBUILD_NOTES.md. Where the appendix gives exact code or values, use them exactly. The prompt file in prompts/ is given; don't edit it. Write every test in spec 04's acceptance criteria using a fake JsonLlm, then run npm run typecheck and npm test. Build and run everything offline; write the OpenAI path but don't run it. The offline catalogueHash must stay 5caf2bbb0f343546. Tick milestone 4 off in docs/plan.md and record any new choices in REBUILD_NOTES.md.

Finish by reporting the test results, which acceptance criterion each test covers, and anything you had to interpret.
