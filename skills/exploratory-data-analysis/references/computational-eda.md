# Computational data and existing ML/GP results

Apply only sections relevant to the investigation. This reference inspects existing evidence; it does not authorize model fitting or training.

## Run records and comparison integrity

Identify dataset/split, condition, method, configuration including defaults, seed roles, fidelity/budget, metric definitions, and original run IDs. Preserve pairing explicitly; matching seed numbers alone does not prove common random draws or matched data. Detect many-to-many joins before merging metrics.

Keep execution completion, numerical validity, model adequacy, and scientific support separate. Retain failed, interrupted, warning-bearing, and unattempted cases. Missing metrics are not zero. Report attempted/planned counts and any successful-fit-only conditioning; apparent accuracy improvements may reflect selective failures.

Before pooling, check units, outcome normalization, sample weighting, information available to each method, hardware, dtype, optimizer/solver settings, and stopping rules. Record cost scope: compilation, training, tuning, prediction, transfers, and synchronization may differ. GPU wall time without synchronization and first-call JAX compilation timings are not interchangeable with steady-state execution. Inspect existing timing provenance; do not assume it is recoverable.

## Existing training diagnostics

Inspect train/validation trajectories, checkpoint selection, seed variability, gradient/parameter diagnostics if recorded, NaN/Inf values, divergence, and stopping reasons. Distinguish epochs, optimization steps, data exposure, and wall time. Smoothing can hide instability; preserve unsmoothed evidence. Never select checkpoints using test performance.

Optimization success is not identifiability or model adequacy. A flat loss, small gradient, or favorable objective can coexist with poor calibration or nonidentifiable parameters. Record unavailable diagnostics rather than fabricating them or retraining without permission.

## Gaussian-process and predictive diagnostics

For existing GP fits, inspect kernel/mean/likelihood definitions, input/output transforms, noise versus numerical jitter, bound-hitting hyperparameters, repeated inputs, Cholesky warnings, conditioning diagnostics if available, and exact versus approximate inference. For sparse/variational models record inducing-point selection and optimization evidence; objective values need matching definitions and scaling before comparison.

Distinguish latent-function uncertainty from observation predictive uncertainty and pointwise intervals from simultaneous bands. Identify whether hyperparameter uncertainty is integrated or conditioned on a fitted estimate. Back-transform means and intervals appropriately; a nonlinear inverse transform of a mean is generally not the original-scale mean.

On authorized held-out predictions, inspect residuals versus inputs/time, subgroup performance, interval coverage across nominal levels, width/sharpness, and a suitable proper predictive score such as log score or CRPS when available and well-defined. Coverage alone can be made high by broad intervals; training coverage does not establish generalization. Separate interpolation from extrapolation and in-distribution from shifted evaluation.

Preserve the independent evaluation unit when summarizing or constructing uncertainty. Repeated test points, correlated trajectories, folds, and reused datasets must not become artificial replication. Inferential comparison belongs in statistical-analysis, with the estimand and dependence structure stated first.
