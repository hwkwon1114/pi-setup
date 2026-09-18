# Inference for computational investigations

## Define what generalizes

Distinguish uncertainty conditional on a fixed dataset/split from variability over new datasets, subjects, tasks, training randomness, observation noise, or numerical approximations. State which sources were sampled and which are held fixed. Many seeds on one dataset do not establish generalization across datasets.

Choose weighting deliberately: an average over datasets differs from an average over all observations, and either differs from a deployment-weighted target. Keep distinct estimands separate. Preserve per-case effects before aggregation and show heterogeneity where relevant.

## Pairing, folds, and hierarchical replication

Use paired contrasts when methods share evaluation cases under a justified matched design. A seed integer is not itself evidence of pairing: verify shared data/splits/random inputs and record matching keys. Avoid many-to-many merges. For incomplete pairs, specify how missing counterparts change the target and show sensitivity where feasible.

Cross-validation folds overlap in training data; repeated CV scores are not independent replicates. Naively applying a t-test to all folds understates uncertainty. Use a defensible design-aware method or state that fold spread is descriptive rather than a confidence interval for generalization. Hyperparameter tuning and method selection belong inside appropriate validation/nested evaluation; an independent final evaluation is needed after adaptive selection.

For multiple datasets with repeated seeds, distinguish between-dataset and within-dataset variability. Consider dataset-level paired summaries, a suitable hierarchical model, or structured resampling aligned with the target population. Very few independent datasets/clusters mean weak generalization evidence regardless of row count.

## Failures and numerical validity

Retain planned, attempted, completed, numerically invalid, interrupted, and failed cases. Do not drop divergent models silently or substitute zero for missing scores. Summaries restricted to successful fits estimate conditional performance; report that condition and completion rates alongside accuracy/cost. Any failure penalty or composite utility needs a pre-specified rationale and sensitivity analysis, not a convenient post hoc value.

Record optimizer/solver stopping, warnings, precision, actual budgets, and relevant hardware differences. A numerical error bound is not a statistical confidence interval; discretization and surrogate approximation errors need their own treatment. Optimization tolerance, model fit, predictive adequacy, and scientific validity are separate checks.

## ML/GP uncertainty and evaluation

Distinguish:
- latent function versus noisy-observation prediction;
- parameter posterior versus predictive distribution;
- pointwise versus simultaneous coverage;
- fitted-hyperparameter conditional uncertainty versus integrated hyperparameter uncertainty;
- within-run posterior uncertainty versus between-run/dataset variability.

Specify the likelihood, noise model, transforms, approximation, and evaluation distribution. Report proper predictive scores when suitable, calibration/coverage with its nominal level and uncertainty, and sharpness/width. Coverage alone rewards overly broad intervals; a narrow interval alone is not calibrated. In-sample agreement is not held-out predictive evidence. Separate interpolation, extrapolation, and distribution shift.

Calibration uncertainty must respect dependent observations. Use design-aware intervals/resampling rather than binomial independence by default for correlated trajectories or clustered test points. Diagnose conditional/subgroup calibration where scientifically motivated, disclose selection and small sample sizes, and avoid turning a search over subgroups into unqualified confirmatory claims.

Separate observation noise, epistemic uncertainty, and numerical/approximation error where identifiable; do not claim decomposition solely because a model labels components. Identifiability requires assumptions and evidence beyond tight fitted intervals. For plots, use scientific-visualization and its statistical-figures reference if available.

## Equivalence, power, and sequential decisions

To support practical equivalence/noninferiority, define a domain-justified margin before examining the relevant results and use an appropriate interval/test or explicitly specified Bayesian decision rule. A large p-value for a difference test does not establish equivalence. A posterior region-of-practical-equivalence probability is not automatically a frequentist equivalence test.

For planning, specify effect sizes or a plausible range, variance, correlation/ICC, independent unit count, allocation, attrition/failure, multiplicity, and decision rule. Round required sample sizes upward respecting clusters and allocation constraints. State which assumptions drive the result. Do not claim normality or power guarantees from a generic n threshold.

Post hoc observed power based on the observed effect is not informative evidence beyond the associated test. Prefer interval precision and, when helpful, detectable-effect sensitivity over a justified range. Simulated power/coverage studies require explicit execution scope, recorded generative assumptions, reproducible seeds, and Monte Carlo uncertainty; proposing one does not authorize running it.

For adaptive allocation, optional stopping, or repeated interim looks, specify the design and inferential/decision framework. Fixed-sample frequentist p-values generally do not retain their nominal interpretation after arbitrary repeated peeking. Bayesian updating also requires careful stopping/selection and decision interpretation, not an unconditional guarantee of error control.
