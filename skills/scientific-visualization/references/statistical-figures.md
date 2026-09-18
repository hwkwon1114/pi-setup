# Statistical research figures

Read for identifiability, uncertainty quantification, calibration, decision-making, and ML/GP updating figures. Choose the smallest set of plots that answers the question. This is optional, domain-neutral visualization guidance—not a statistical analysis protocol, model-fitting mandate, or literature review. Use already available analysis outputs; identify missing evidence and request authorization before new analyses or experiments.

The core skill's concise-text, filename, integrity, and export policies still apply. General replication, timing, and simulation safeguards live in [computational-figures.md](computational-figures.md); do not duplicate them in every caption.

## Start with the statistical target

Identify what is plotted: a parameter, identifiable parameter combination, latent function, future observation, probability, action, utility, or numerical diagnostic. State the conditioning data, evaluation population/design, and reference where relevant. Establish whether the intended claim concerns estimation, prediction, computation, or decisions; success in one does not establish success in the others.

## 1. Identifiability

**Useful views:** profile likelihoods; selected joint likelihood/posterior contours; parameter-pair samples; sensitivity or information-matrix spectra; identifiable combinations and corresponding predictions.

**Interpretation safeguards:**
- Distinguish structural identifiability (a property of the specified model and observation design under idealized information) from practical identifiability with finite, noisy data. A plot alone is not a proof of structural identifiability.
- A narrow posterior can reflect an informative prior, constraints, regularization, or sampling failure. Do not equate it with likelihood-based identification; compare prior and likelihood-informed evidence when available.
- Marginal distributions can hide ridges, multimodality, and confounding. Show scientifically relevant joint structure; pairwise projections can themselves miss higher-dimensional dependencies.
- Distinguish profiling (optimizing nuisance parameters), fixing them, and Bayesian marginalization. Label the operation actually performed. Do not draw a confidence-threshold line without a justified statistic, reference distribution, and assumptions.
- Report parameter scaling, evaluation point, and noise weighting for sensitivity/information spectra. Local curvature and numerical rank depend on these choices and are not global identifiability certificates.
- Poor parameter identification can coexist with stable predictions or decisions. Show the target relevant to the research question rather than implying all uncertainty has the same consequence.

## 2. Uncertainty quantification

**Useful views:** distributions or interval plots; predictive mean/median with clearly defined bands; selected joint function draws; coverage-versus-nominal curves with interval width; uncertainty components when actually available.

**Interpretation safeguards:**
- Distinguish parameter uncertainty, latent-function uncertainty, observation noise, model discrepancy, and numerical approximation error. Use epistemic/aleatoric labels only with an explicit modeling interpretation.
- Identify the interval type, level, construction (for example equal-tailed or highest-density), and whether coverage is pointwise or simultaneous. Pointwise bands do not imply whole-curve coverage.
- Mean ± 1.96 SD is not a universal 95% interval. Use the actual distribution/quantiles or justify the approximation; do not conceal skewness, constraints, or separated modes with a symmetric band.
- Do not stack standard deviations or assume an additive uncertainty decomposition. Variance components require a justified decomposition and treatment of dependence/covariance.
- Show calibration alongside sharpness: wide intervals can cover well without being informative. State the held-out evaluation design and dependence-aware uncertainty in empirical coverage estimates.
- Density contours must distinguish density levels from enclosed probability mass. For transformed variables, transform densities with the appropriate Jacobian; simply relabeling an axis can change the claimed density meaning.

## 3. Parameter calibration versus predictive calibration

**Parameter calibration:** estimating model parameters from observations. Useful views include prior/posterior comparisons, parameter dependencies, residuals versus inputs, and posterior predictive checks of relevant summaries.

**Predictive calibration:** agreement between forecast probabilities/intervals and empirical outcomes. Useful views include reliability diagrams for classification, coverage curves for regression, and PIT diagnostics when applicable.

**Interpretation safeguards:**
- State which meaning of calibration is intended. A well-fitting parameter estimate does not establish calibrated predictive probabilities.
- In prior/posterior comparisons, use consistent coordinates and normalization. If changing parameterization, account for its effect on density.
- Posterior predictive checks using the fitted data diagnose aspects of model fit; they are not held-out predictive validation. Choose summaries relevant to the question instead of showing only a visually favorable overlay.
- A discrepancy term can confound physical/statistical parameters; disclose its role rather than attributing all posterior concentration or fit to parameter information.
- For reliability diagrams, report binning, counts and class conditioning; include uncertainty where justified. Aggregate calibration can hide subgroup failures. Regression PIT diagnostics require the appropriate predictive CDF; discrete outcomes need a suitable discrete/randomized construction, not naive continuous-PIT assumptions.
- If simulation-based calibration results are supplied, identify the generative model and inference procedure being tested. Rank behavior assesses computational calibration under that simulation setup, not adequacy for real-world data.
- Check available chain/optimizer diagnostics before interpreting posterior shape. Trace/rank plots, effective sample sizes and convergence summaries are diagnostic evidence, not guarantees that all modes were explored.

## 4. Decision-making

**Useful views:** expected utility/loss by action; action boundaries across relevant inputs; regret versus budget; risk or constraint-violation summaries; value of information relative to measurement/computation cost.

**Interpretation safeguards:**
- Define the action set, utility/loss, constraints, conditioning information, and expectation being taken. State whether larger or smaller is better.
- Distinguish expected utility from the distribution of realized utility. Show tail risk or constraint probabilities when relevant rather than relying only on a mean.
- Define regret's comparator and whether regret is instantaneous, cumulative, simple, expected, or realized. Do not invent an unavailable oracle optimum.
- Uncertainty reduction is not automatically decision improvement. Compare decision-relevant loss/utility and the cost of acquiring information where the evidence supports it.
- A probability that an action is optimal is not itself its expected utility. Label these separately; check whether plausible loss/prior/model choices change the selected action.
- Do not select the researcher's preferred action from aesthetics or an unstated risk preference. Present the comparison and assumptions.

## 5. ML and Gaussian-process models

**Useful views:** predictions and reference observations; latent-function and observation-predictive bands; residuals; learning curves; held-out coverage; slices through multivariate models; joint posterior function draws.

**Interpretation safeguards:**
- For a GP, distinguish uncertainty in the latent function from the predictive distribution of a new noisy observation. State whether kernel/hyperparameter uncertainty is integrated out or conditioned on fitted values.
- Do not imply a fitted kernel accounts for all model uncertainty. Label in-domain/interpolation and extrapolation regions; posterior confidence can be misleading under misspecification.
- Function draws should come from the joint predictive distribution, not independently sampled marginal intervals at each input.
- For high-dimensional slices, identify fixed variables or the marginalization/reference distribution. A one-dimensional slice is not the entire response surface.
- Learning curves need explicit training size or budget, evaluation protocol, and what variation across repetitions represents. Keep validation used for selection separate from final test evaluation where applicable.
- If showing standardized outputs or nonlinear back-transformations, identify the plotted scale. Inverse-transforming a mean is generally not the same as computing the mean on the original scale.

## 6. Sequential updating and acquisition

**Useful views:** before/after predictions on shared axes; prior-to-posterior or posterior-to-updated-posterior comparisons; performance versus update step/budget; acquisition values with selected points; pre-update predictive checks against subsequently observed outcomes.

**Interpretation safeguards:**
- Identify the data available at each step. Do not leak later observations into earlier predictions or report post-update fit as pre-update forecasting performance.
- Distinguish conditioning on new data, hyperparameter refitting, retraining, and a changed model specification. Do not label every change Bayesian updating.
- Use the previous posterior as the next prior only under a valid sequential model with the appropriate new-data likelihood; avoid counting old evidence twice.
- Under distribution shift, identify the evaluated population/time window; compare on a fixed held-out target or explicitly report a changing target. Preserve replay/evaluation protocol details where relevant.
- Acquisition scores are criterion-specific, not observed utility or probabilities unless defined that way. State maximization/minimization, feasible domain, evaluation cost/budget and selected points.
- Data-dependent acquisition changes the sampled design. Do not claim population-wide calibration or error from adaptively selected observations without accounting for that evaluation design.

## Keep the artwork concise

Suggested panel labels: `Profile likelihood`, `Joint posterior`, `Predictive coverage`, `Expected loss`, `Latent function`, `Updated prediction`.

Suggested stable filenames: `parameter_profile_likelihood.pdf`, `predictive_coverage.pdf`, `action_expected_loss.pdf`, `posterior_update_comparison.pdf`.

Put conditioning assumptions, interval definitions, evaluation design and diagnostic limitations in the caption or linked methods/provenance—not paragraphs inside the axes. Do not replace established project terminology merely to match these examples.
