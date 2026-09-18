---
name: statistical-analysis
description: Plan and interpret statistical inference for research data and computational investigations. Use for estimands, paired or hierarchical method comparisons, assumption diagnostics, effect sizes and uncertainty, multiplicity, power, Bayesian checks, and ML/GP predictive evaluation. Separates exploratory patterns from confirmatory evidence; not a model-training launcher.
license: MIT
compatibility: Instruction-only. Use the project's existing statistical libraries and verify installed APIs; no mandatory package manager, dependency pins, or bundled executable tools.
metadata:
  adaptation: Local Pi adaptation of K-Dense statistical-analysis
---

# Statistical analysis

Start with the estimand and study design, not a test-name lookup. Produce an interpretable finding linked to evidence, including uncertainty and limits.

Provenance: [ATTRIBUTION.md](ATTRIBUTION.md).

## Integrate, do not duplicate

Read project instructions and the relevant question, investigation plan, data dictionary, existing analysis, and run schema. Follow research-workflow for investigation/evidence records, exploratory-data-analysis for input diagnostics, and scientific-visualization for figures. If unavailable, keep these principles without installing sibling skills automatically.

Use the current environment and project runner. Verify actual library versions and APIs before writing executable analysis; do not assume upstream examples match installed packages. No automatic dependency installs, training, simulation-based power runs, sweeps, scheduler jobs, uploads, or destructive cleanup. Scope execution to the user's request and approved resources.

## 1. Write a minimal analysis contract

Reuse the investigation note; do not demand a new document for a small task. Establish:

- **Question and estimand:** target population/conditions, outcome and units, contrast or parameter, aggregation/weighting, and practically meaningful effect or decision threshold.
- **Design:** sampling/randomization mechanism, independent unit, repeated measures, pairing, clusters, blocks, time/space structure, and dependence from reused datasets or adaptive selection.
- **Evidence status:** pre-specified versus exploratory, available sample size at each level, data/split identity, exclusions and missing/failure handling.
- **Method and uncertainty:** model/test, assumptions, interval type/level, hypothesis family and multiplicity policy, sensitivity checks, and any decision rule.

Ask only about missing information that changes the analysis materially. Record other limitations. Post hoc analysis is legitimate when labeled exploratory; selecting and reporting only favorable tests is not.

For method comparisons, seeds/folds, computational failures, predictive UQ, equivalence, or power planning, read [references/computational-inference.md](references/computational-inference.md).

## 2. Diagnose assumptions without mechanical pretesting

Inspect raw distributions, missingness, influential observations, residuals where appropriate, variance structure, and the actual independence mechanism. Normality tests neither certify normality when nonsignificant nor automatically require a rank test when significant. A universal sample-size cutoff does not guarantee robustness.

Choose diagnostics relevant to the estimator and design: paired differences for paired mean inference; conditional residuals rather than marginal predictor normality for regression. Consider sample imbalance, skew, tails, leverage, and the magnitude of violations. Independence cannot be established from a Shapiro-Wilk test or residual plot.

Do not switch tests mechanically according to a preliminary variance/normality p-value. State any plan changes, their reason, their effect on the estimand, and which results were inspected before changing the plan. Use robust or design-aware methods where justified and compare defensible sensitivity analyses without shopping for significance.

## 3. Match method to question

| Target/design | Starting point and essential caveat |
|---|---|
| Mean difference, independent groups | Welch inference is often a useful default; still assess independence, tail behavior, sample size, and design. |
| Mean within-pair change | Analyze paired differences or an appropriate repeated-measures model; retain matching and handle missing pairs explicitly. |
| Several groups or factors | Model planned contrasts and interactions; use heteroscedastic or hierarchical structure where appropriate. An omnibus test alone does not answer every contrast. |
| Rank/distribution contrast | Mann–Whitney targets relative ordering/distributional differences, not generally a median difference. Wilcoxon signed-rank has symmetry assumptions for a location interpretation. |
| Continuous outcome regression | Specify functional form, confounding limits, variance and dependence; robust SEs do not fix a misspecified mean or unmeasured confounding. |
| Binary/count/censored outcomes | Use an appropriate likelihood/link or survival/censoring model; address sparse cells, separation, overdispersion, and exposure as relevant. |
| Clustered, longitudinal, multi-dataset data | Use design-aware aggregation, mixed/hierarchical models, cluster-robust inference, or valid structured resampling; few clusters limit approximations. |
| Bayesian estimation | Specify priors, likelihood, computation, and checks; posterior conclusions are conditional on these choices. |

Resampling is not assumption-free. Bootstrap independent units or suitable blocks/clusters, preserving pairing and hierarchy. Permutation requires exchangeability or a valid randomization scheme under the tested null. Do not resample correlated rows as independent cases.

## 4. Report magnitude and uncertainty honestly

Lead with the raw-scale contrast and an interval; add standardized effect sizes only when useful and define their denominator and direction. Do not apply universal small/medium/large labels without scientific context. Distinguish variability (SD), precision (SE/CI), predictive uncertainty, and posterior credible intervals.

A p-value measures tail incompatibility with a specified null model under its assumptions; it is not the probability the null is true, the probability of replication, or proof an effect exists. A nonsignificant result is not evidence of equivalence. A confidence interval has repeated-sampling coverage under its procedure, not a posterior probability for the realized interval.

Define the tested family, including outcomes, contrasts, subgroup searches, and model-selection flexibility. Use an appropriate pre-specified FWER/FDR strategy when needed and report its scope and assumptions. Exploratory labels alone do not repair selective inference. Keep planned null/negative findings and disclose unplanned analyses.

## 5. Bayesian checks when relevant

Choose priors on a meaningful scale, justify them, and inspect prior predictive implications. Data-dependent priors require disclosure and sensitivity checks; do not quietly use the same data twice as independent prior evidence.

For MCMC, inspect chains, divergences, mixing, rank-based R-hat, bulk/tail ESS, and Monte Carlo error for the quantities reported. No single threshold certifies correctness. For variational/approximate inference assess approximation limitations; optimization convergence is not posterior calibration.

Use posterior predictive checks for relevant discrepancies and prior/model sensitivity. Distinguish posterior directional probabilities, practical-equivalence probabilities, and Bayes factors; one is not a substitute for the others. A continuous parameter posterior does not assign positive mass to an exact point null without an explicit model. Bayes factors depend strongly on prior/model specification.

Sequential Bayesian inference is not a blanket exemption from design, selection, or decision-error concerns. State stopping/selection rules and assess the operating properties needed for the intended decision. Predictive model comparisons must respect clustering/time and use diagnostics appropriate to the chosen criterion.

## 6. Evidence-linked handoff

Report question/estimand, design and independent n, data snapshot, method/assumptions, estimates and interval definitions, test statistics/df and p-values when applicable, multiplicity, diagnostics, exclusions/failures, sensitivity, and limits. Never print p = 0; report suitable precision or a bound. Report fractional degrees of freedom when relevant.

Separate observed results, model-conditional interpretation, and proposed next steps. Link selected notebook sections, analysis code/version, input/run IDs, transformations, actual environment, random seeds, outputs, and missing historical provenance. Use the project's reporting style, not mandatory APA formatting or a new dashboard. Record executed, unrun, and unavailable checks explicitly. Successful code execution is not statistical validation or causal identification.
