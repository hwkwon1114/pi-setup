# Working preferences

Keep instructions and deliverables minimal: shared defaults here, project facts in project instructions, methods in skills. Prefer one authoritative source; preserve evidence and researcher notes. Report actual checks, limits and decisions left to the researcher.

## Opening deliverables

In Pi within VS Code's remote terminal, offer copyable `code /absolute/path` commands, not file hyperlinks. Verify files exist and quote paths containing spaces. Ordinary web links are fine.

## Research direction and restored context

- For research work, read the authoritative objective and active investigation record at session start, after compaction/resumption or branch changes, and before a new stage or expensive execution. Restore the scientific target, approved scope, information/resource limits, rejected directions, unresolved conflicts and next authorized action; a summary or historical queue is not authorization.
- Before implementing a new investigation, use `research-workflow` to connect its question and possible outcomes to a scientific decision. Distinguish direct evidence, necessary supporting diagnostics and separate questions. Do not replace the target with a convenient proxy metric; non-identifiability and negative results can be valid outcomes. Ordinary maintenance needs no scientific protocol.
- Keep one stable objective entry point and one current investigation record, reusing existing documents. Methods belong in skills. Update objectives only from explicit researcher direction, retaining provenance; resolve consequential conflicts rather than silently choosing a historical recipe.
- Give delegates the objective/state paths, task-to-objective connection, non-goals, edit boundary, information/resource limits and expected decision. Delegates return evidence or proposals, not expanded authorization.

## Experiments

- Within a user-requested, fixed scope and cumulative budget, execute planned experiments and investigations end-to-end without repeated procedural approvals. Apply rigorous methodology (checklists, validation, checkpointing, and reporting), with sensible safety ceilings and early stopping; keep hard limits in the plan or cluster scripts. Ask before extending the budget, restarting from scratch, changing the scientific recipe, or releasing sealed tests outside the predeclared policy. Stop and consult the researcher for unrecoverable failures, allocation overruns, or fundamental changes in direction.
- Before comparative training, use `research-workflow` for the training checklist. Check provenance, scaling, optimization, regularization and finite losses/gradients for every comparator; equal caps do not establish fairness.
- Default to group/trajectory-safe validation, predeclared selection/stopping rules and best-checkpoint restoration. Count validation in acquisition budgets; resolve no-extra-data conflicts before fitting and label approved fixed-budget exceptions. Never tune on tests.
- Preserve curves and selected/final checkpoints; assess overfitting and convergence. Cap-limited results are fixed-recipe evidence, not best achievable performance.
- For long or large runs, ensure resumable checkpoints so progress is preserved. Handle verified continuation within cumulative resource limits. Stop and consult the researcher only if an unrecoverable failure occurs, runs would exceed declared cluster allocations, or a fundamental change in scientific direction is required.

## Research figures

Lead with full held-out aggregates and error distributions, respecting dependence. Use matched, error-independently selected examples; disclose selection and omissions. Best/worst cases are labeled diagnostics, not representative comparisons. Use `scientific-visualization` for the detailed procedure.

## Code reviews

- Before neural-network training, long-running compute jobs or expensive simulations involving newly written/modified code, complete an independent pre-execution review with `astra-code-reviewer` / `openai-2/gpt-6-astra`. Quick edits, small exploratory checks and explicitly bounded correctness fixtures do not require reviews; repeated fixtures must not become an unreviewed training campaign. Declare their scope and ceiling before execution.
- Wait for the verdict and resolve launch-blocking findings before execution. Review scientific relevance as well as code, tests, data access, numerical standards, stopping and resumability under the actual project contract. Record reviewed code/config/data/design identities and scope in the existing run review; consequential changes require reassessment. An absent, failed or stale review is not approval. `APPROVED_WITH_CAVEATS` permits launch only with no unresolved launch blockers and with limits recorded. Approval does not expand scope or release sealed tests.
- If Astra reaches its temporary subscription usage limit, report the quota block; use Sol (`openai-2/gpt-6.1-sol`) only if approved, otherwise await reset. These are instruction-based gates, not a runtime launch guarantee.

## Literature

- Delegate substantive multi-paper reviews, updates, research gaps and direction comparisons through `literature_review`; announce delegation and pass bounded scope, constraints, existing evidence and absolute paths. A single supplied paper can be summarized in-main with `paper-summary`; configuration, isolated-paper explanations and saved-material reorganization may also stay in-main. Respect explicit no-subagent requests; do not duplicate reviews or bypass dispatch caps.
- Use `research-workflow` for handoff/integration checks. Extend the authoritative review in place, preserving IDs, provenance, qualifications, notes and history. Separate reviews need a distinct topic or explicit request. A finished child is not a verified update; incomplete integration/rendering stays partial. Reorganization needs no new search.
- If unavailable, suggest `/reload` or restart. On failure/exhaustion, report blockers and saved partial work; ask before switching to in-main review. Never claim an unrun delegation.
- Research-ideas and literature MCPs are role-only: no in-main loading or shell bypass. Explain this limitation for explicit in-main requests before proposing configuration changes.

Task authorization does not permit unrequested package installations, credential/configuration changes, private uploads, Zotero writes, or destructive file deletions. Experimental execution requested by the user is authorized to run autonomously within project compute guidelines. These instructions guide behavior; they are not enforced security controls.
