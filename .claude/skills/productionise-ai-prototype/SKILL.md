---
name: productionise-ai-prototype
description: Use when taking an R&D or AI prototype (anything with an LLM, embeddings or another model in it) towards production, especially on a regulated or player/customer-facing surface. Walks through where each AI step should run, the hard rules around it, guards, evaluation and gates, declining, versioning, an offline path and the ADR, and produces PRODUCTIONISATION.md plus an ADR.
---

# Productionise an AI prototype

Work through these steps in order and write the answers to `PRODUCTIONISATION.md` at the repo root. Each step has a **default move**: take it unless you can say why this prototype is different, and write that reason down. Ask the owner only for the decisions marked *owner decides*.

1. **Map the AI stages.** For every model call, list its inputs and outputs, who sees the output, where it runs, its latency and cost per call, and how it fails (timeout, malformed output, plausible but wrong).
   **Default:** move to build time anything that doesn't need per-request input. Precompute and cache. A model in the request path needs a written reason.

2. **Name the protected fields and the hard rules.** List the fields only source data may set (prices, regulated figures, availability, legal status), and the rules that must always hold (eligibility, safety policy).
   **Default:** the rules are deterministic code that runs **after** the model, on every result, and **fails closed**: missing data means *not allowed*. The model may tighten a rule but never loosen one. *Owner decides* the policy numbers, with compliance.

3. **Put a guard between every model and its consumers.**
   **Default, all of these:**
   - a strict schema plus a closed vocabulary, validated in code even if the provider enforces it;
   - source values win over model values;
   - a lint on any free text, which discards it rather than repairing it;
   - per-field provenance (source, model, rules);
   - a per-record fallback when the model fails;
   - input text treated as untrusted, in the prompt and in code.

   Nothing generated is shown to end users unless there's a written reason.

4. **Define "good" per stage**, with reference data and metrics: what a correct output is, how it's measured, and on which data.
   **Default:** build a reference set with known answers, including planted traps for each failure mode. Say which labels are **silver** (a rule or a model standing in for a human) and which are **gold** (human-labelled), and plan the gold set before launch.

5. **Write the gates as data, before looking at results.** Write a gates file with a threshold and a `why` per gate.
   **Default:**
   - a gate with no value fails;
   - `--gate` exits non-zero and blocks publishing;
   - gates change only in review, with the reason recorded;
   - operating points such as thresholds are tuned separately from the gates, and that tuning is recorded too.

6. **Make declining a first-class outcome.**
   **Default:** a closed list of reason codes; the client hides the feature on a decline rather than showing an error or a fallback; and a test per reason code. "Decline over pad."

7. **Version everything a result depends on:** model id, prompt version (in the file name), pipeline/schema version, data hash, config hash and thresholds.
   **Default:** content-addressed caches keyed on all of them, atomic artefact writes, and an artefact version derived from its inputs. The serving side refuses an artefact the evaluation didn't attest.

8. **Keep an offline path.** A keyless, deterministic stand-in for every model call, so tests and CI run with no secrets.
   **Default:** offline outputs go to separate, git-ignored folders. They test software behaviour only and are never quoted as quality results.

9. **Write the ADR from the template** in `templates/ADR.md`: context, decision with a diagram, infrastructure, alternatives, trade-offs, failure behaviour from the end user's view, scaling triggers, and the evidence that would make you revisit.
   **Default:** the failure table leads with what the user sees in every failure case. *Owner decides* the infrastructure where the organisation already has a standard.

## Done when

- `PRODUCTIONISATION.md` answers steps 1–8 for this prototype, with a reason for every departure from a default;
- the ADR exists, written from the template;
- CI runs typecheck, tests and the gates with no API key.
