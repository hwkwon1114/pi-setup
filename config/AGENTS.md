# Working preferences

Project facts live in project `AGENTS.md`; methods in skills. Keep one authoritative record per fact. Be concise; report actual checks, limits and decisions left to the researcher.

## Research work: cards

- A **card** (`cards/<ID>.md`, from the project template) is the unit of scientific work and approval: question, decision each outcome drives, formulas (F1…), known-answer checks, metrics/gates, data and information access, stopping rule, compute plan. The researcher approves the card. Decisions: full row with date and rationale in `DECISIONS_LOG.md`, one plain-language line per current rule in `DECISIONS.md`.
- A new research project without these files: run `/lab-init` (creates the card template, verifier/critic prompts, dashboard, decision files and `.pi/lab.json`; never overwrites), then fill in the objective. Keep `RESEARCH_STATE.md` under 6000 characters (only that much is injected each turn).
- At session start/resume, read the project objective, the active card and `DECISIONS.md` (full rows in `DECISIONS_LOG.md` when a rule matters). Summaries, queues and old approvals are not authorization.
- Within an approved card, work end-to-end without procedural check-ins: implement → known-answer tests → **verifier** → run → analyse → report. Ask only for changes to the card's question, formulas, metrics/gates, data access or substantial compute, or for genuine blockers.
- Do not substitute a proxy metric for the card's target; negative and non-identifiable results are valid outcomes. Never tune on final tests or relax a gate to pass.

## Asking the researcher for decisions

- In questions, briefs and `ask_user_question` options, explain in plain words what is going on, what each option does and what it changes or costs. Letters, option codes and internal IDs ("option (b)", O2, D79, F9, KA1, arm names such as MP3/NOM_D) are not explanations; if one is needed for traceability, put it after the plain description.

## Verification gate

- Before training, sweeps or expensive simulation on new/changed code, run the `verifier` subagent (Astra, read-only) against the card. `BLOCKING ISSUES` must be fixed and re-verified; absent/failed/stale verification is not approval. Quick edits and bounded CPU fixtures need no verifier.
- If Astra is quota-blocked, report it; use Sol only with approval.
- An async verifier or job is a dependency wait: return control, do not poll; the completion wakes the session.

## Jobs and GPUs

- Launch long-running work with `job_start` (not `nohup`/`&`); it applies the project `.pi/lab.json` GPU policy, records code hashes and wakes the session on exit. A zero exit code is not evidence of correct results.
- Spread independent fits one per GPU across permitted GPUs. Do not change running experiments to adopt new settings.

## Delegation

- Implementation: `worker` (Terra). Verification: `verifier` (Astra). Literature: `literature_review` for multi-paper work, with bounded scope and absolute paths. Delegates get the card path, edit boundary and expected output; they return evidence, not authorization.
- A finished child is not a verified result; inspect its output.

## Figures and deliverables

- Lead with held-out aggregates and error distributions; disclose example selection. Best/worst cases are labelled diagnostics.
- In VS Code remote, give `code /absolute/path` commands for files.

Task authorization does not cover package installs, credential/config changes, private uploads, Zotero writes or destructive deletions.
