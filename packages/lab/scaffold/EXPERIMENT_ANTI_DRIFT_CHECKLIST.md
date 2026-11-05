# Experiment anti-drift checklist

Use at a completed investigation or staged handoff before strengthening README or
manuscript claims. Record the applicable findings and failures in
the existing run `review.md`; do not create another checklist report or rerun
unchanged tests just to fill boxes. Ordinary debugging steps are not separate
scientific handoffs. Mark genuinely inapplicable items briefly.

The project objective, active card and decisions determine the target and recipe. This checklist checks evidence, not architectural conformity.
Independent pre-execution review remains required under AGENTS.md; this post-run
check neither replaces it nor authorizes a new experiment.

## Minimal claim check

- [ ] **Question:** Identify the run/evidence path, approved question, target,
  domain and actual outcome. Distinguish direct evidence from supporting diagnostics.
- [ ] **Implementation:** Relevant mathematics, numerical behavior, interfaces and
  scoring were checked. State source-fidelity/adaptations for reproduced methods,
  review scope, unresolved failures and checks not performed.
- [ ] **Information and fairness:** Report allowed observations, provenance,
  training/adaptation, comparator selection/tuning opportunities and resource
  differences. No privileged truth or consumed test data leaked into selection.
- [ ] **Evaluation:** Report planned-versus-completed coverage, failures and negative
  results; preserve pairing, actual independent units and dependence. Explain
  metrics, uncertainty, exclusions and example selection without cherry-picking.
- [ ] **Claim boundary:** Separate prediction/control utility, effective calibration,
  physical attribution, discrepancy and latent-state estimates. Improved prediction,
  narrow conditional posteriors or orthogonality alone do not establish physical
  recovery; empirical particle acceptance alone does not certify safety/coverage.
  Apply only the distinctions relevant to the intended claim.
- [ ] **Evidence preservation:** Save relevant config/seeds/split/model identities,
  outputs and analysis provenance in existing artifacts. Keep failed and superseded
  results qualified; no silent overwrite, retrospective test resealing or threshold
  relaxation. Figures and summaries match the underlying metrics and information.
- [ ] **Decision:** State what the evidence supports, leaves unresolved and changes
  next. Separate scientific findings from implementation failure or resource limits.
  README/manuscript language must not exceed these conclusions.

## Project-specific checks

<Add checks for this project's recurring failure modes.>
