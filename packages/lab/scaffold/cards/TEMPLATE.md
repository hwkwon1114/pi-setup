# <CARD-ID>: <short title>

Status: draft | approved (date, researcher) | running | complete | abandoned
Stage: card | critique | approved | implement | verify | run | audit | result-audit | brief | done — next action: <one line> (shown every turn by the lab state block; update at each transition)
Decisions cited: D-xx, … (from `DECISIONS.md`; do not restate rules here)
Edit boundary: files the implementer may create/change.
Evaluation level: <if the project uses a staged evaluation protocol, name the level>.
Varied component: <one>. Held fixed: <components with identities: model id/seed, settings, data split>. Criterion: <metric at this level>.

## 1. Question → decision
One question. A table of possible outcomes and what each changes next.

| Outcome | Interpretation | Next action |
|---|---|---|

## 2. Data roles and information access
Runs/splits and who may see what. Every arm row must be fillable without ambiguity.

| Arm | <input 1, e.g. noisy history> | <input 2> | <privileged truth> | train data | calibration/validation data | test data |
|---|---|---|---|---|---|---|

Privileged truth and test data: evaluator only unless stated (an oracle arm is labelled as such).

## 3. Formulas
Number every equation F1, F2, … with symbols, shapes, units, indices and
initial conditions. Code implementing an equation carries `# F<n>` at that line.
Mark anything not yet fully specified as **[SPEC GAP]** — the verifier reports
gaps, it does not fill them.

## 4. Ablation matrix
Arms × components (on/off), and the single thing each contrast isolates.

| Contrast | Isolates |
|---|---|

## 5. Known-answer and sanity checks
Each check: input, exact expected result, tolerance, test name. Prefer checks
derivable from the formulas alone (nesting, limits, invariances, oracle arms).

## 6. Predictions (written before running)
Direction and rough size per arm/contrast. A large surprise triggers a bug
hunt before interpretation.

## 7. Metrics, gate, stopping rule
Primary endpoint (one), secondary metrics, unit of analysis, pairing, CI
method, exclusions, gate/decision thresholds, stopping rule, resource estimate.

## 8. Verification record and run record
Verification: link the verifier report(s) and verdict; list blocking findings and how each was fixed and re-verified.

Run record (written **before** launch, so nothing needed later lives only in the conversation):
| Job ID | Command (exact) | GPU | Output dir | Code identity (git HEAD + sha256 of changed files) |
|---|---|---|---|---|

Post-processing commands (eval, summary, figures) with their output paths, added when run.

## 9. Results (after running)
Filled ablation table with CIs; prediction vs outcome; failed checks;
deviations from this card; claim boundary; decisions needed (≤3, each explained in plain words: what is going on, what each option does and costs).
