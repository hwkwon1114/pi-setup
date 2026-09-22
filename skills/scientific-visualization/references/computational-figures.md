# Computational research figure patterns

Select only plots justified by the research question and available evidence. These are general patterns, not a mandatory dashboard or an assumption about the application domain.

| Question | Useful encoding | Checks |
|---|---|---|
| Does a prediction track a reference signal? | Aligned reference/prediction time series and residual panel | Same coordinates and units; retain transients and missing-data gaps |
| Is prediction biased across the range? | Reference-vs-predicted parity plot with identity line | Same limits and equal aspect for directly comparable quantities |
| Does error depend on inputs or conditions? | Residual vs. input; small multiples or heatmap | Define residual sign; shared limits; distinguish unobserved regions |
| Are predictions calibrated? | Empirical vs. nominal interval coverage, plus interval width | Appropriate held-out data; interval semantics; dependence-aware uncertainty |
| Which method performs better? | Paired results, distributions, or estimates with uncertainty | Same cases, metrics, budgets, and evaluation protocol |
| Does a numerical method converge? | Error vs. resolution, step size, iteration, or computational effort | Define error norm and reference solution; justify log scales and any order-of-convergence guide |
| How does an optimizer behave? | Objective or optimality gap vs. iteration, evaluations, or elapsed time | Comparable stopping criteria and budgets; distinguish one trajectory from independent runs |
| What is the accuracy–cost tradeoff? | Error vs. runtime/memory; Pareto plot if justified | Hardware/software, workload, timing scope, repetitions, and optimization directions |
| How does computation scale? | Runtime, throughput, speedup, or efficiency vs. problem size/resources | Distinguish strong/weak scaling; state baseline and resource definition |
| Are spatial fields reproduced? | Reference, predicted, and error maps | Coordinates, geometry/aspect when meaningful, units, common scales for comparable fields |
| Which design choices matter? | Paired ablations or sensitivity curves | Controlled changes, interactions/confounding, matched evaluation conditions |

## Performance comparisons and example selection

Lead with full held-out aggregates and error distributions, respecting trajectory/group dependence. Illustrative traces supplement, not replace, full-set evidence: even a randomly selected single trace does not establish representative performance.

Select multiple examples with a recorded error-independent rule (such as a fixed seed), stratifying over relevant conditions when feasible. Match example IDs, axes, horizons and observation/control access across methods; disclose selection, omissions and aggregation. Best/worst or error-quantile cases belong only in explicitly labeled diagnostics alongside full-set results, never as unbiased method comparisons.

## Alignment and missingness

- Verify coordinate systems, ordering, sampling intervals, time origins, and unit conversions before comparing outputs.
- Do not shift or transform predictions solely to improve visual agreement. Disclose justified alignment and whether estimated from training or evaluation data.
- Keep missing observations as gaps. If timestamps or grid points are omitted entirely, detect the missing region rather than connecting retained observations silently.
- Dense traces may conceal spikes after downsampling. Use a documented envelope or supplemental zoom when appropriate; do not discard inconvenient transients.

## Independent evidence and uncertainty

- Define the independent unit appropriate to the inference: for example, dataset, experimental unit, independent run, or simulation realization. Temporal, spatial, and repeated observations may be dependent.
- Many samples from one trajectory are not many independent trajectories. Multiple random seeds characterize algorithmic variation under the evaluated conditions, not generalization across all possible datasets or systems.
- Use a justified dependence model, independent-unit summaries, or an appropriate cluster/block procedure for inferential intervals. Document grouping or block structure; do not select it arbitrarily.
- Seaborn may automatically aggregate repeated x values and estimate intervals. For an already computed trace, use Matplotlib or disable aggregation/error bars explicitly. Preserve separate run identities when plotting multiple trajectories, after checking grouping/order.
- Distinguish confidence in a mean, variability across runs, predictive uncertainty, and numerical error. Label the actual quantity rather than generic `uncertainty`.
- Do not invent confidence intervals for a single deterministic solve. Numerical error estimates require an appropriate reference or justified estimation procedure.

## Evaluation and residual semantics

- Define residual sign once, such as `prediction − reference`, and reuse it consistently.
- State whether the reference is a measurement, analytical solution, higher-resolution computation, benchmark label, or another comparator. Do not automatically call a numerical reference ground truth.
- Distinguish training/calibration, validation, and test roles when applicable. Not every computational experiment is a machine-learning evaluation.
- A parity plot or high R² alone does not establish temporal fidelity or calibrated uncertainty. Include complementary evidence only when relevant.
- Define error norms, normalization, aggregation weights, and denominator choices. State handling of near-zero reference values for percentage errors.
- Show failure, nonconvergence, missing results, extrapolation, and infeasible cases explicitly rather than silently averaging only successes.
- For runtime comparisons, disclose warm-up, compilation, caching, synchronization, hardware, concurrency, and timing scope where relevant. Do not compare incompatible measurement protocols.

## Caption scaffold

`[Quantity or comparison] under [evaluation conditions]. (a) [Panel content]. (b) [Panel content]. [Lines/markers] denote [identities]; shading denotes [interval type and level]. Results use [number and independent unit]. [Reference definition, residual convention, and essential preprocessing].`

This is a scaffold, not literal output. Omit inapplicable clauses and ask for missing facts rather than inventing them. Keep discussion-length interpretation in the manuscript.
