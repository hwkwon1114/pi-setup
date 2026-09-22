# Comparative training and resumable experiments

Use before fitting, at launch review, and when reviewing or resuming runs. This checklist does not authorize experiments or supply a universal optimizer recipe. Follow the project's environment/resource contract.

## Before comparative training

Record and check for every comparator:

- Initialization and pretrained provenance, source/data identities, trainable/frozen components.
- Input/target scaling and where normalization was learned; prevent validation/test leakage.
- Optimizer, learning rates/schedule, regularization (including justified absence), and finite initial losses/gradients.
- Group/trajectory-aware train/validation/test splits, selection metric, patience/minimum improvement, minimum training and compute ceilings; count validation in acquisition cost.
- If validation conflicts with few-shot/no-extra-data access, resolve the tradeoff before fitting. Explicitly label approved fixed-budget exceptions; never borrow test observations.

Apply reasonable training practice to every comparator. Equal update caps alone do not establish fairness. Restore validation-best checkpoints; preserve train/validation curves and selected/final states. Review overfitting, convergence and cap hits before interpreting differences. Cap-limited runs support fixed-recipe comparisons, not best achievable architecture performance. Never select recipes or extensions using test outcomes; any bounded follow-up needs an appropriate held-out evaluation.

## Checkpoint contract for long/large runs

Saved weights alone are not resumability. Require an exercised restart path before scientific launch:

- Save model, optimizer, scheduler, RNG/sampler state, completed/attempted steps and resource counters, validation/early-stopping and best-selection state, completed-cell progress, and code/config/data identities.
- Write atomically at bounded intervals and on graceful interruption. Retain best and latest resumable states, final states and prior evidence.
- Test interruption/restoration on a bounded fixture, including continuation of selection/stopping and cumulative resource accounting without rerunning completed cells. Check mismatched identity rejection. Document numerical tolerances rather than assuming bitwise equivalence.
- Support CPU/GPU-portable loading; check numerical compatibility and record device changes. Do not silently alter dtype, precision or scientific settings to resume.

Verified continuation is permitted only within the existing authorization and original cumulative budget. Preserve completed fits, selection/test barriers and consumed resources; do not reset caps, automatically retry numerical failures or rerun completed/cap-limited fits. Ask before restarting from scratch, extending budgets or changing the scientific recipe. If restoration is unsupported or fails verification, preserve partial evidence and report the blocker rather than quietly restarting.
