# Working preferences

Keep instructions and deliverables minimal: shared defaults here, project facts in project instructions, methods in skills. Prefer one authoritative source; preserve evidence and researcher notes. Report actual checks, limits and decisions left to the researcher.

## Opening deliverables

In Pi within VS Code's remote terminal, offer copyable `code /absolute/path` commands, not file hyperlinks. Verify files exist and quote paths containing spaces. Ordinary web links are fine.

## Experiments

- Execute requested experiments and investigations autonomously end-to-end: apply rigorous methodology (checklists, validation, checkpointing, and reporting) without halting for intermediate procedural approvals. Set sensible safety ceilings with early stopping; keep hard limits in the plan or cluster scripts.
- Before comparative training, use `research-workflow` for the training checklist. Check provenance, scaling, optimization, regularization and finite losses/gradients for every comparator; equal caps do not establish fairness.
- Default to group/trajectory-safe validation, predeclared selection/stopping rules and best-checkpoint restoration. Count validation in acquisition budgets; resolve no-extra-data conflicts before fitting and label approved fixed-budget exceptions. Never tune on tests.
- Preserve curves and selected/final checkpoints; assess overfitting and convergence. Cap-limited results are fixed-recipe evidence, not best achievable performance.
- For long or large runs, ensure resumable checkpoints so progress is preserved. Handle verified continuation within cumulative resource limits. Stop and consult the researcher only if an unrecoverable failure occurs, runs would exceed declared cluster allocations, or a fundamental change in scientific direction is required.

## Research figures

Lead with full held-out aggregates and error distributions, respecting dependence. Use matched, error-independently selected examples; disclose selection and omissions. Best/worst cases are labeled diagnostics, not representative comparisons. Use `scientific-visualization` for the detailed procedure.

## Literature

- Delegate reviews, updates, gaps and direction comparisons through `literature_review`; announce delegation and pass bounded scope, constraints, existing evidence and absolute paths. Configuration, isolated-paper explanations and saved-material reorganization may stay in-main; respect explicit no-subagent requests. Do not duplicate reviews or bypass dispatch caps.
- Use `research-workflow` for handoff/integration checks. Extend the authoritative review in place, preserving IDs, provenance, qualifications, notes and history. Separate reviews need a distinct topic or explicit request. A finished child is not a verified update; incomplete integration/rendering stays partial. Reorganization needs no new search.
- If unavailable, suggest `/reload` or restart. On failure/exhaustion, report blockers and saved partial work; ask before switching to in-main review. Never claim an unrun delegation.
- Research-ideas and literature MCPs are role-only: no in-main loading or shell bypass. Explain this limitation for explicit in-main requests before proposing configuration changes.

Task authorization does not permit unrequested package installations, credential/configuration changes, private uploads, Zotero writes, or destructive file deletions. Experimental execution requested by the user is authorized to run autonomously within project compute guidelines. These instructions guide behavior; they are not enforced security controls.
