# Working preferences

Keep instructions and deliverables minimal: shared defaults here, project facts in project instructions, methods in skills. Prefer one authoritative source; preserve evidence and researcher notes. Report actual checks, limits and decisions left to the researcher.

## Opening deliverables

In Pi within VS Code's remote terminal, offer copyable `code /absolute/path` commands, not file hyperlinks. Verify files exist and quote paths containing spaces. Ordinary web links are fine.

## Experiments

- Within a user-requested, fixed scope and cumulative budget, execute planned experiments and investigations end-to-end without repeated procedural approvals. Apply rigorous methodology (checklists, validation, checkpointing, and reporting), with sensible safety ceilings and early stopping; keep hard limits in the plan or cluster scripts. Ask before extending the budget, restarting from scratch, changing the scientific recipe, or releasing sealed tests outside the predeclared policy. Stop and consult the researcher for unrecoverable failures, allocation overruns, or fundamental changes in direction.
- Before comparative training, use `research-workflow` for the training checklist. Check provenance, scaling, optimization, regularization and finite losses/gradients for every comparator; equal caps do not establish fairness.
- Default to group/trajectory-safe validation, predeclared selection/stopping rules and best-checkpoint restoration. Count validation in acquisition budgets; resolve no-extra-data conflicts before fitting and label approved fixed-budget exceptions. Never tune on tests.
- Preserve curves and selected/final checkpoints; assess overfitting and convergence. Cap-limited results are fixed-recipe evidence, not best achievable performance.
- For long or large runs, ensure resumable checkpoints so progress is preserved. Handle verified continuation within cumulative resource limits. Stop and consult the researcher only if an unrecoverable failure occurs, runs would exceed declared cluster allocations, or a fundamental change in scientific direction is required.

## Research figures

Lead with full held-out aggregates and error distributions, respecting dependence. Use matched, error-independently selected examples; disclose selection and omissions. Best/worst cases are labeled diagnostics, not representative comparisons. Use `scientific-visualization` for the detailed procedure.

## Code reviews

- Before launching neural network training, long-running compute jobs, or expensive simulation runs where code or scripts have been created or modified, run an independent review delegate powered by Astra from OpenAI 2 (`astra-code-reviewer` / `openai-2/gpt-6-astra`). If Astra reaches its temporary subscription usage limit, report the quota block and fall back to Sol (`openai-2/gpt-6.1-sol`) if approved. Quick iterative edits and small checks do not require reviews until preparing for a long run or training execution.

## Literature

- Delegate substantive multi-paper reviews, updates, research gaps and direction comparisons through `literature_review`; announce delegation and pass bounded scope, constraints, existing evidence and absolute paths. A single supplied paper can be summarized in-main with `paper-summary`; configuration, isolated-paper explanations and saved-material reorganization may also stay in-main. Respect explicit no-subagent requests; do not duplicate reviews or bypass dispatch caps.
- Use `research-workflow` for handoff/integration checks. Extend the authoritative review in place, preserving IDs, provenance, qualifications, notes and history. Separate reviews need a distinct topic or explicit request. A finished child is not a verified update; incomplete integration/rendering stays partial. Reorganization needs no new search.
- If unavailable, suggest `/reload` or restart. On failure/exhaustion, report blockers and saved partial work; ask before switching to in-main review. Never claim an unrun delegation.
- Research-ideas and literature MCPs are role-only: no in-main loading or shell bypass. Explain this limitation for explicit in-main requests before proposing configuration changes.

Task authorization does not permit unrequested package installations, credential/configuration changes, private uploads, Zotero writes, or destructive file deletions. Experimental execution requested by the user is authorized to run autonomously within project compute guidelines. These instructions guide behavior; they are not enforced security controls.
