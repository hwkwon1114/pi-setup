# Comparative training and resumable experiments

Use when planning comparative fits, reviewing launch readiness, or resuming a run.
This guidance does not authorize execution or prescribe a universal optimizer.
Follow the project's environment, independent-review and information contracts.

## Match rigor to the question

Declare the study type in the existing investigation note before fitting:

- **Reproduction:** follow the published recipe; disclose adaptations and unavailable
  details. Do not silently replace it with a preferred optimization schedule.
- **Feasibility or fixed-recipe pilot:** use a small informative recipe and report
  recipe-specific outcomes, not best achievable performance or universal failure.
- **Fixed-resource comparison:** declare the relevant resource and selection
  opportunities. Resource-limited outcomes are valid evidence for that question.
- **Convergence-oriented comparison:** define model-appropriate validation and
  stopping criteria; inspect adequacy before claiming architectural differences.

None is a universally superior design. Choose from the scientific question, not
from which protocol is easiest to pass. Do not change the study type after seeing
results merely to rescue a claim. Record permitted development refinements and
material-change boundaries up front so ordinary iterations need no new approval.

## Minimal pre-fit record and checks

Reuse the existing protocol and runner. Record:

- Comparator initialization, pretrained provenance, trainable/frozen components,
  code/config/data identities and material environment/device/precision settings.
- Allowed information, normalization provenance, group-aware splits and actual
  independent units; prevent privileged-state and validation/test leakage.
- Model-appropriate optimizer/schedule, selection metric, stopping rule, seeds,
  tuning opportunities, failure handling and actual resource restrictions.
- Planned scoring, uncertainty/aggregation, exclusions and final-test release policy.

Check relevant mathematical operations, finite losses/gradients, scoring and
information boundaries with focused fixtures. Use representative timing/memory
checks only for unresolved feasibility risks; reuse unchanged evidence. Scientific
fairness does not require identical epochs or schedules, but differences in
information, tuning and compute must be declared and justified.

Complete the host-required independent pre-execution review. Resolve launch
blockers and record caveats; optional improvements do not hold the run hostage.
Reassess consequential changes in the affected scope, not every unchanged path.

## Selection and evaluation

Use the predeclared recipe. Where validation selects a model, restore the selected
checkpoint and distinguish strict-best selection from patience/minimum-improvement
logic. Preserve learning curves, selected-step location, stop reason and failures
at the level needed to interpret the comparison.

For convergence-oriented studies, inspect train/validation behavior and whether
the schedule had a meaningful chance to act. Plateau is an operational criterion,
not proof of global optimality, generalization or physical identification. A cap
hit may leave convergence unresolved; it does not invalidate a predeclared
fixed-resource study. Do not drop difficult cells or automatically expand compute.

Freeze selection before final evaluation. Use a separate release step OR the
predeclared release policy; no additional researcher prompt is needed when the
approved policy already authorizes release and its conditions hold. Job completion
alone does not establish those conditions. Never tune on consumed final tests or
claim they have been resealed. Follow-ups need an appropriate evaluation design
and preservation of the original results.

Report full planned-versus-completed coverage, dependence, effect sizes/uncertainty
as applicable, and limitations. Numerical completion is not scientific success.

## Resource protection without a custom framework

Use existing scripts, standard checkpoints and error handling by default. Honor
real researcher/cluster allocations, memory/device safeguards and scientific
stopping rules. Estimate material total cost before launch and consult on
substantial unplanned demand; do not invent time/call quotas as approval gates.
When actual deadlines exist, allow for validation, I/O and finalization, not just
updates; see [execution environments](execution-environments.md#budget-and-finalization).

Choose interruption handling by failure cost, not an arbitrary runtime category:

- Inexpensive disposable work may stop and report, preserving partial evidence.
- When interruption would materially waste resources or compromise a comparison,
  or the approved contract requires it, test the actual continuation path.

## Continuation when required

Save the state needed for faithful continuation: model, optimizer, scheduler,
RNG/sampler, completed progress, validation/early-stopping and best-selection
state, and code/config/data identities. Retain best and latest states and avoid
silent overwrites; use atomic checkpoint writes where corruption is a credible risk.
Track cumulative resources when a real cumulative allocation applies.

Exercise interruption/restoration with a small fixture covering affected state
and identity mismatch rejection. Saved weights alone do not prove resumability.
Check device/precision compatibility only for supported transitions; portable
CPU/GPU restoration is not mandatory when the run requires no such transition.

Resume within the approved scope without replaying completed cells or resetting
real allocations. Diagnose failures and repair ordinary implementation problems
autonomously; obtain affected-scope review before consequential execution. Ask
before an unplanned restart from scratch, material recipe change or substantial
resource increase. If faithful restoration is unavailable, preserve partial
results and report the blocker rather than silently restarting.
