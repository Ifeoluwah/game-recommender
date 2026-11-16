# Candidate notes (for you, not a deliverable)

Raw material for the sections only you can write: README "One output I changed or rejected", AI_USAGE "What wasn't kept", and EVALUATION "Commentary".

**Sources:**
- commit hashes from the git reflog, matched to `docs/prompt-log.md` by time (all 2026-11-16, UTC). Where a file proves it, `git log` confirms it: `repairs.ts` and the "Titles already used" repair came in `37e881b`; `real-names.ts` in `ca7749b`; the plan in `e9f9551`; the threshold analysis in `fc2452e`; the enrichment cache in `2b6403a`;
- figures from the committed OpenAI build's report (`eval/reports/latest.json`, index `ef13f1ecf784`) unless marked otherwise.

## Commits, for reference

| Commit | Time | Message |
| --- | --- | --- |
| `c1b06c5` | 00:27 | Skeleton: specs, agent rules and prompt logging |
| `e9f9551` | 01:15 | Spec 01: synthetic catalogue and normaliser |
| `346a9ce` | 01:31 | Spec 02: guardrail layers and compliance traps |
| `30c0cb3` | 01:35 | Spec 03: benchmark clusters and evaluation dimensions |
| `37e881b` | 02:06 | Fix: cluster title collisions, live_dealer, layout fit, display-title dedupe |
| `ca7749b` | 02:23 | Fix: reject real-world names in generated titles; record kept mess |
| `e1faaf9` | 02:33 | Spec 04: LLM enrichment and guard |
| `f27ee03` | 02:49 | Spec 05: embeddings index and recommendation service |
| `2cb95fb` | 02:54 | OpenAI index, enriched catalogue and variants |
| `2b6403a` | 03:17 | Spec 06: ranking evaluation, runner and report |
| `fc2452e` | 03:26 | First OpenAI evaluation: 14/15 gates; bad-rec fails at 0.45; threshold analysis |
| `3d94da0` | 03:46 | Theme-or-series relatedness rule: bad-rec 0.137; lift gate left failing; declines documented |
| `de7a2c3` | 07:36 | Spec 07 hardening; demo accepts documented NJ decline; per-brand coverage; README trade-offs |

## AI output changed or rejected

### Model output (`gpt-4o-mini`, catalogue generation)

| # | What the model produced | What happened to it | Commit |
| --- | --- | --- | --- |
| 1 | **First OpenAI generation run:** slots 30 and 45 both titled "Bandit Ridge: Outlaw's Bounty", same studio. Batches of 10 can't see each other's titles | **Run rejected** (it failed). You specified a repair loop: regenerate the later slot with the used titles listed, up to 3 attempts | `37e881b` (prompt 01:39) |
| 2 | **The first catalogue that generated:** a repeated title inside a benchmark cluster ("Deep Sea Catch", g-022 and g-067); `live_dealer` on 6 non-live games (g-012, g-015, g-028, g-040, g-041, g-050); layouts contradicting the game type | **Rejected as not fit to commit** (`docs/notes/openai-catalogue-inspection.md`). You specified three generator repairs; regenerated | `37e881b` (prompts 01:46, 01:53) |
| 3 | **The 02:06 rebuild:** real-world names in titles ("Wheel of Fortune Live", "Casino Royale Live", the borderline "Candyland Delight") | **Rejected.** You added a real-name deny-list to the repair loop; regenerated | `ca7749b` (prompt 02:15) |
| 4 | **The committed build: 22 model outputs changed** during generation (`data/generated/manifest.json` → `repairs`) | Repaired by the loop or in code. Highlights below the table | `ca7749b` (the committed `data/generated/`; the first generated build is in `37e881b`) |
| 5 | **Two misleading-title traps the model defused:** g-019 "Fruit Blast Scratch" and g-057 "Festive Scratch Extravaganza" name their true type, so the traps test nothing | **Kept, not regenerated**, and disclosed as vacuous (the generator doesn't check a misleading title's shape) | disclosure `2b6403a` |
| 6 | **Win-promise copy** in 8 of 108 descriptions ("massive wins", "chance to win big"), and metadata that contradicts its copy | **Kept on purpose** as realistic feed mess the guard must handle; recorded as known limitations | `37e881b` / `ca7749b` |

**Highlights of #4, the 22 repairs:**
- **Real names, 3:** "Candyland Parade" → "Candy Dreams: Sweet Spins", "Deal or No Deal: Live Challenge" → "Card Clash: Live Showdown", and "Lucky Clover Lane: Rainbow Riches" → "Lucky Clover Lane: Emerald Enchantment".
- **Title collisions:** 4 title + studio, e.g. "Fortune's Bounty" → "Wealth of the Ancients"; 3 within clusters, e.g. "Pharaoh's Cascade" → "Cascading Pharaohs".
- **Layouts regenerated, 2:** two scratch cards given slot layouts ("6x7 Megaways, 117,649 ways"; "5x3, 10 lines") → "3x3 scratch grid".
- **Done in code with no model call:** 4 placeholder layouts cleared, and `live_dealer` removed from 6 non-live games.

### Model output (`gpt-4o-mini`, enrichment)

| # | What happened | Commit |
| --- | --- | --- |
| 7 | **The guard rejected nothing in the committed build.** 0 tags rejected, 0 LLM fallbacks, 0 injection leaks, 0 protected-field violations. 62 records went to the LLM; 51 complete records skipped it | `2cb95fb` (build), `fc2452e` (report) |
| 8 | **2 wrong fills kept and scored wrong:** g-035 "Thunder Halls: Odin's Fury" got `mythology` (truth `nordic`); g-074 "Outlaw's Bounty" got `adventure` (truth `western`) | report |

### Coding-agent output

| # | What the agent produced or proposed | What happened | Commit |
| --- | --- | --- | --- |
| 9 | **Plan resolutions** proposed for P-6, P-7, P-8 and P-32 | **Changed by you:** drop the appendix exporter; fix the stale comment now; the exact file format; separate git-ignored offline folders with no fallback | `e9f9551` (prompt 00:41) |
| 10 | **Scoping the display-title dedupe** to one build | **Overruled:** a service rule for both builds ("don't scope to openai") | `37e881b` / `ca7749b` (prompt 02:05) |
| 11 | **One "baselines superseded" list** | **Split by you** into re-baselined (what `recommend()` serves) and kept (hash, traps, gates, cluster similarity metrics) | `ca7749b` (prompt 02:08) |
| 12 | **The milestone 6 plan said one vacuous misleading-title row (g-019)** | Corrected by the agent to two (g-019 and g-057) after checking `data/generated/` | `2b6403a` |
| 13 | **Theme rule with "same studio" as a third relation** (as asked) | **Measured and dropped** with you: bad-rec 0.385 (still failing), 53 `NO_CONFIDENT_MATCHES` declines; 6 studios relate a fifth of the catalogue to any seed | `3d94da0` |
| 14 | **Threshold-only fixes:** minScore 0.69 without the rule (the only grid-adjacent pass: bad-rec 0.094, coverage exactly 0.800), and the sweep's suggested 0.6 | **Rejected:** fitted to the coverage gate's edge, and embeddings drift between rebuilds. The threshold stays 0.45 | `fc2452e` (analysis), `3d94da0` |
| 15 | **The original cold-start trap row** ("declining is always a miss") | **Revised with you:** a decline is ok when ground truth has fewer than 3 related eligible games | `3d94da0` |
| 16 | **Demo case 3** exited 1 on both builds after the theme rule (found at milestone 7) | **Changed by you:** accept a documented `NO_CONFIDENT_MATCHES` decline | `de7a2c3` |
| 17 | **Your instruction** "do not call g-050 a false abstention; it answers" | **Not followed as written:** the report and a probe of every context show g-050 declines. The README says it declines and is this build's one trap miss | `de7a2c3` |
| 18 | **Spec 07 AC7's "39/39 traps"** | Reported as 38/39, the offline build's g-003 miss caused by the theme rule, not glossed | `de7a2c3` |

## The strongest failure cases in the report

1. **g-050 "Roulette Royale" declines but should answer** (aurora/GB, `NO_CONFIDENT_MATCHES`, 4 related eligible tables by ground truth). It's the one trap miss (39/40), caused by the theme rule: the rule removed 13 candidates, and without it the request answers with 5 items. It's invisible to gated coverage, because the gated oracle obeys the rule.
2. **The lift gate fails:**
   - enriched nDCG@5 0.725 against raw text 0.728 (−0.003);
   - `rules_enriched` scores 0.73, so on ranking the LLM doesn't beat the keyword baseline;
   - `random` neighbours score 0.689 once the theme rule filters them, so the rule does most of the work.
3. **liberty/NJ gets no rails:** 0 of 25 queries, and even the oracle answers none. There are 22 eligible games across 13 themes, 10 of them with fewer than 3 games.
4. **Theme-mates of the wrong game type** (nDCG@5 0): g-019 "Fruit Blast Scratch" gets 4 fruit slots; g-061 "Fishing Frenzy Pick Bonus" (bingo) gets fishing slots and a scratch card; g-090 "Catch of the Day Scratch" gets the bingo game and slots. g-062 "Pharaoh's Gold" has a scratch card at #1.
5. **Enrichment worsens near-miss intrusion:** `egyptian_cascade` 0 → 0.4, `live_game_show` 0.8 → 1 (raw text → enriched). Served Recall@5 for `live_game_show` is 0.2.
6. **Coverage 1.0 is flattering:** 0.843 against the oracle without the rule (70 queries). Declines are 117 of 184.
7. **Trap passes that prove less than they look:** two vacuous misleading-title rows (g-019, g-057), and four twin rows that pass on anchor rails that declined anyway.
8. **Never shown something it shouldn't:** 0 eligibility, duplicate or policy violations in 2,260 calls. The good-news case, worth contrasting with the above.
