# Comparative training and resumable experiments

Use before fitting, at launch review, and when reviewing or resuming runs. This checklist does not authorize experiments or supply a universal optimizer recipe. Follow the project's environment/resource contract.

## Scope and proportionality: fast benchmarks vs long campaigns

Do not apply distributed cluster-orchestration requirements to lightweight experiments:
- **Fast benchmarks & lightweight models (< 15 min total runtime, small local MLPs/ODEs, toy systems):**
  - Completely exempt from production checkpoint resumption contracts, POSIX file locking (`fcntl.flock`), crash-gap watermarks, and micro-second feasibility profiling.
  - Never invent distributed cluster infrastructure (flocks, atomic ledgers, multi-stage watermarks) for fast local scripts.
  - Standard in-memory execution, basic model checkpointing (`torch.save(model.state_dict())`), and normal Python error handling are sufficient.
  - Reviews for fast benchmarks must focus on scientific methodology: valid physics/equations, honest comparators, held-out validation, and truthful UQ—not cluster DevOps.
- **Long/large campaigns (> 1 hr per fit, multi-GPU training, cluster jobs):**
  - The formal checkpoint contract and feasibility envelope apply here to prevent wasted compute from machine crashes or allocation timeouts.

## Evidence gates: launch, selection, test release

Record these decisions in the existing run protocol/review, not a parallel checklist system. Each gate needs evidence paths, checked code/config/data identities, pass/blocked/not-applicable status and unresolved limits. Missing evidence is not a pass. These are workflow requirements, not implemented runtime guards; test runner enforcement before describing a gate as automatic.

1. **Design ready:** declare convergence-oriented versus explicitly resource-limited comparison, the validation/stopping recipe, acquisition budget and authorized resource ceiling. Justify the number of independent validation groups and coverage of relevant conditions relative to checkpoint/start/hyperparameter selection. A single trajectory can support a bounded feasibility study, but needs an explicit limitation—not an assertion that plateau proves generalization. Resolve inadequate validation before fitting without borrowing tests.
2. **Execution ready:** inspect existing device evidence first. On approved hardware, use a bounded development-only fixture representative of the actual training/calibration objective, batch shapes, precision and differentiated operations—not source-training speed alone. Record timing/memory and, for device changes, loss/gradient and short-update agreement under declared tolerances. Test production loading and continuation, including scheduler, early stopping and best-selection state, cumulative resource accounting and identity rejection, as specified below. Unsupported resumption blocks a long-run launch (for runs > 1 hr); fast benchmarks (< 15 min) are exempt. Saved weights or a successful timing script do not clear this gate for large campaigns.
3. **Optimization reviewed, tests still sealed:** after fitting, check every required attempt's coverage, finite values, train/validation curves, LR history, selected-step location, stop reason and restored best state. Classify adequacy as supported for the declared recipe, cap-limited/unresolved, or failed; plateau alone does not guarantee it. Resolve a proposed extension using train/validation evidence and explicit authorization before test release. Under a convergence-oriented plan, unresolved required fits block the intended converged comparison; alternatively obtain approval to report a clearly labeled fixed-recipe study. Do not drop difficult cells or automatically expand budgets.
4. **Selection locked and scoring authorized:** freeze selected model/config identities and the adequacy decision before the scorer can read tests. Implement a separate explicit release step or a predeclared, tested release policy; do not release merely because all jobs returned. A declared fixed-budget study may release with disclosed cap hits under its original policy. Once tests have been accessed, preserve that fact and the original results: extensions are follow-ups with an appropriate held-out evaluation, not retroactive resealing.
5. **Claims reviewed:** scoring/report generation is not scientific completion. Check full coverage, dependence, qualifications and required numerical/visual reviews before promoting claims. Preserve failures and unresolved results.

## Before comparative training

Record and check for every comparator:

- Initialization and pretrained provenance, source/data identities, trainable/frozen components.
- Input/target scaling and where normalization was learned; prevent validation/test leakage.
- Optimizer, learning rates/schedule, regularization (including justified absence), and finite initial losses/gradients.
- Group/trajectory-aware train/validation/test splits, selection metric, patience/minimum improvement, minimum training and compute ceilings; count validation in acquisition cost.
- If validation conflicts with few-shot/no-extra-data access, resolve the tradeoff before fitting. Explicitly label approved fixed-budget exceptions; never borrow test observations.

Default to validation-driven optimization adequacy, not equal epochs, update counts or wall time. Before fitting, declare meaningful validation improvement, validation frequency, LR reductions and their floor (or a justified alternative schedule), and plateau patience after the schedule has had time to act. Normally stop on sustained validation plateau under that schedule and restore the strict validation-best checkpoint; distinguish the minimum improvement used for patience from checkpoint selection. A validation plateau is an operational stopping criterion, not proof of full model capacity, a global optimum or physical identifiability.

Apply these adequacy checks to every comparator, with justified model-appropriate recipes rather than identical caps alone. Preserve train/validation curves and selected/final states; review overfitting, LR history, selected-step location and stop reasons before interpreting differences. Resource ceilings remain predeclared safety limits, not normal convergence targets or authorization for unlimited execution. A ceiling hit leaves optimization adequacy unresolved. Fixed-budget studies are appropriate when resource-limited performance is the explicit question or an approved exception; label their results as fixed-recipe evidence, not best achievable architecture performance.

Never select recipes, stopping rules or extensions using test outcomes. Any bounded follow-up needs an appropriate held-out evaluation and the continuation safeguards below; preserve the original capped results rather than replacing them.

## Budget feasibility before launch (long/large runs only; fast benchmarks exempt)

- Measure representative **end-to-end** cost for every comparator: startup, updates, validation, checkpoint serialization/I/O and integrity checks. Separate update-only timings from total CPU and wall time; account for checkpoint/history growth. Reuse same-version measurements with their limits rather than silently equating a short smoke test with campaign feasibility.
- Estimate the earliest completion of the declared stopping schedule, including minimum training, validation intervals, all LR reductions and floor patience. This is a lower bound, not a predicted convergence time: allow substantial headroom for learning before plateau and variation between fits. Do not place a convergence-oriented cap near that lower bound.
- Size per-fit and aggregate limits for all required cases/starts plus gates and reporting, using the declared concurrency. If the authorized envelope is inadequate, resolve the budget or obtain an explicitly resource-limited design before launch; do not expect early stopping to rescue an infeasible allocation. Early stopping need not trigger before a hard cap.
- Keep small correctness fixtures separate from scientific training allocations. Once scope and budget are approved, execute their planned stages without repeated micro-allocation requests; extensions, recipe changes and test release retain their existing approval requirements. See [execution environments](execution-environments.md#budget-and-finalization) for resource reserves and coordinator checks.

## Checkpoint contract for long/large runs (fast benchmarks < 15 min exempt)

Saved weights alone are not resumability. Require an exercised restart path before scientific launch:

- Save model, optimizer, scheduler, RNG/sampler state, completed/attempted steps and resource counters, validation/early-stopping and best-selection state, completed-cell progress, and code/config/data identities.
- Write atomically at bounded intervals and on graceful interruption. Retain best and latest resumable states, final states and prior evidence.
- Test interruption/restoration on a bounded fixture, including continuation of selection/stopping and cumulative resource accounting without rerunning completed cells. Check mismatched identity rejection. Document numerical tolerances rather than assuming bitwise equivalence.
- Support CPU/GPU-portable loading; check numerical compatibility and record device changes. Do not silently alter dtype, precision or scientific settings to resume.

Verified continuation is permitted only within the existing authorization and original cumulative budget. Preserve completed fits, selection/test barriers and consumed resources; do not reset caps, automatically retry numerical failures or rerun completed/cap-limited fits. Ask before restarting from scratch, extending budgets or changing the scientific recipe. If restoration is unsupported or fails verification, preserve partial evidence and report the blocker rather than quietly restarting.
