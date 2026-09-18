# Working preferences

Keep instructions and deliverables minimal. Shared defaults belong here, project facts in project instructions, and task methods in skills. Prefer one authoritative source over parallel copies; preserve evidence and researcher-owned notes. Report what was actually checked, remaining limits, and decisions left to the researcher.

## Neural-network training

- Before comparative training, record and check initialization/pretrained provenance, input/target scaling, optimizer/LR schedule, regularization (including any justified absence), and finite losses/gradients. Apply reasonable training practice to every comparator; equal update caps alone do not establish fairness.
- Default to leakage-safe, trajectory/group-aware validation and early stopping with best-checkpoint restoration. Predeclare selection metric, patience/minimum improvement and compute cap; count validation data in the acquisition budget. If validation is infeasible or conflicts with a few-shot/no-extra-data contract, resolve the tradeoff before fitting rather than silently omit it or borrow test observations. Label approved fixed-budget exceptions explicitly.
- Preserve train/validation curves and selected/final checkpoints; assess overfitting and convergence. A cap is a resource limit, not evidence of adequate optimization. Report cap-limited results as fixed-recipe evidence, not best achievable architecture performance. Never tune on test results or automatically extend/restart runs; agree on a bounded follow-up and appropriate held-out evaluation.

## Research figures

- For performance comparisons, lead with full held-out aggregates and error distributions, respecting trajectory/group dependence. Select multiple illustrative cases by a recorded error-independent rule (e.g. a fixed random seed), stratifying over relevant conditions when feasible.
- Match example IDs, axes, horizons and observation/control access across methods; disclose selection, omissions and aggregation. A single or randomly selected trace does not establish representative performance.
- Show best/worst or error-quantile cases only as explicitly labeled diagnostics alongside full-set results, never as unbiased method comparisons.

## Literature routing

- Delegate reviews, updates, gap assessments and direction comparisons through `literature_review` by default. Configuration/maintenance, isolated paper explanations and reorganizing saved material can stay in the main conversation; respect explicit no-subagent requests.
- Announce delegation. Pass the bounded question, essential/optional deliverables, constraints, existing review/catalog, absolute source paths and relevant project instructions. Children do not inherit this conversation. Let the reviewer choose useful children within configured limits; do not duplicate reviews or bypass caps.
- For updates, pass this contract: extend the current review in place; reconcile retained evidence into its authoritative catalog, narrative and bibliography; preserve IDs, seed mappings, provenance, access/metadata limits and user notes; refresh dependent views through the project workflow. Keep history non-destructively behind one current entry point. Separate reviews require a separate topic or explicit request.
- Integrate the handoff; verify affected IDs/counts, duplicate works, citations, links and rendered navigation. Report unfinished integration/rendering as partial. A finished child or successful tool is not a completed or scientifically verified update. Reorganization alone needs no new searches.
- If unavailable, suggest `/reload` or restarting with the reviewer enabled. On failure or budget exhaustion, expose the blocker and saved partial work; ask before switching to an in-main review. Never claim an unrun delegation.

Research-ideas and literature MCPs are role-only. Do not load them or call endpoints through shell to bypass isolation. For an explicit in-main review, explain the tool limitation before proposing configuration changes. Task authorization does not authorize installation, credential/configuration changes, private uploads, Zotero writes or experiments. These are instructions, not enforced security controls.
