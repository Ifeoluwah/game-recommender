# Claude Code

@AGENTS.md

Claude-specific notes:

- The repo's reusable skill is `.claude/skills/productionise-ai-prototype/`. Use it when taking any new R&D prototype towards production.
- Specs for larger changes live in `docs/prompts/`. Start a task with: `Read @AGENTS.md and implement @docs/prompts/<spec>.md`, and commit the spec alongside the change.
- Before finishing, run `npm run typecheck`, `npm test` and `npm run eval`, and summarise the gate and planted-trap results from `eval/reports/latest.md`. Until an OpenAI build is committed, run `npm run eval -- --provider=offline` and read `eval/reports/offline/latest.md` instead. `npm run check` (which includes `eval:gate`) passes only on a model-built index: an offline build fails the ranking gates by design (spec 06 AC2).
