# Live pilot: identifiability / neural computer-model calibration

Executed 2026-09-09 during skill authoring. This is a bounded integration smoke test, NOT a completed literature update, comprehensive screening exercise, trend analysis, or novelty verdict. The baseline review was not modified. This compact record uses the pilot exception in `protocol.md`; it retains exact executed requests and selected evidence, not the full provider responses.

## Baseline and research contract

Input: project `LITERATURE_REVIEW_IDENTIFIABILITY.md`, status date 2026-09-05. Sections 8, 10, 11 and selected bibliography entries were inspected. No explicit search cutoff was established; cutoff remains **unknown**. The document itself says its search was targeted, not systematic (§8), and that some recent theoretical claims are abstract-only (§12, reference 14).

Pilot question: can paired retrieval surface decision-relevant neural calibration work and distinguish it from probability calibration of classifiers?

Recent search window: calendar years 2024 onward, used because the user requested catching up with latest trends. This does not mean the baseline covered everything before 2024. The all-year duplication repair below is only a small coverage-repair sample.

Comparison axes: inference target; role of the network; treatment of model discrepancy; parameter/discrepancy separation; source access and evidence limits.

## Exact executed requests

| ID | Provider/tool | JSON arguments | Observed result |
|---|---|---|---|
| C1 | Consensus `search` | `{"query":"neural network model discrepancy Bayesian computer model calibration identifiability","year_min":2024}` | Successful, 20 records; direct calibration candidates mixed with classifier/probability-calibration results. |
| F1 | FastTrack `search_papers` | `{"query":"neural network model discrepancy Bayesian computer model calibration identifiability","year_from":2024}` | Successful, 20 records; many broad/off-field results. Effective OpenAlex query omitted “model” before “calibration”. |
| F2 | FastTrack `search_papers`, repair of F1 | `{"query":"\"model discrepancy\" \"calibration\"","year_from":2024}` | Successful, 20 records; effective query `model discrepancy calibration` did not retain quotes. Mixed relevance persisted, but a shared direct calibration candidate appeared. Not a demonstrated general precision improvement. |
| D1 | FastTrack `run_duplication_test` | `{"question":"Can independently anchored neural model discrepancy improve physical parameter identifiability in Bayesian computer model calibration?"}` | Successful transport, 10 leads; off-field top results. Scientifically inadequate nearest-neighbour set; no novelty inference. |
| D2 | FastTrack `run_duplication_test`, repair of D1 | `{"question":"Kennedy O'Hagan calibration discrepancy identifiability"}` | Successful, 10 leads; first two results directly concern computer-model calibration/identifiability. This broadens to foundations; it does not settle the precise neural anchoring proposal. |

No paid pagination/full-text-excerpt options were requested. Consensus returned no signup/upgrade/search-counter notice in C1. Returned counts are not unique included studies. Full corpus deduplication and exhaustive screening were not attempted.

## Selected evidence and decisions

### P1: a neural calibration candidate requiring comparison

C1 result [11]: [Should We Simultaneously Calibrate Multiple Computer Models?](https://consensus.app/papers/details/3a28aca2c4e6560a8e0785bc3932d97d/?utm_source=unknown) (J. Eweis-Labolle et al., 2025, ArXiv, 0 citations reported by Consensus at retrieval).

Primary record inspected: https://arxiv.org/abs/2505.18176; primary text sections Abstract, 1, 2 and the displayed portion of 3 inspected at https://arxiv.org/html/2505.18176v2. Authors verified on the record: Jonathan Tammer Eweis-Labolle, Tyler Johnson, Xiangyu Sun, Ramin Bostanabad. Submitted May 14, 2025; v2 May 29, 2025. Access label: **partial_full_text**; the full evaluation/discussion was not inspected in this pilot.

| Claim | Evidence/locator | Decision boundary |
|---|---|---|
| The paper proposes Interpretable Probabilistic Neural Calibration (iPro-NC), with a multi-block architecture for simultaneous multi-source calibration. | Primary §3 opening and §3.1. | A direct candidate for the neural-calibration comparison, not merely classifier probability calibration. |
| The authors report prediction benefits alongside non-identifiability limitations. | Primary Abstract: “prone to non-identifiability issues in higher-dimensional input spaces”. | This records the authors' stated limitation; the experiments have not been independently audited or reproduced. |
| The proposed method should not automatically be classified as the project's frozen additive neural discrepancy. | §3.1 describes latent source relationships and joint use of available data; baseline §4 defines a frozen offline correction. | [INFERENCE] Compare the actual architectures and assumptions before claiming either equivalence or a novel difference. |

A baseline search for `Eweis`, `4070128` and related candidate identifiers found no matching entry. This is a **coverage-repair candidate**, not proof the underlying topic was absent. C1 also returned result [10], *Simultaneous Calibration of an Arbitrary Number of Multi-response Computer Models*, DOI `10.1115/1.4070128`. Similar author/abstract metadata suggests a version relationship, but that relationship was not verified here; do not count it as independent evidence or silently merge it.

### P2: a same-DOI overlap across connectors

C1 result [1]: [Bayesian Experimental Design for Model Discrepancy Calibration: An Auto-Differentiable Ensemble Kalman Inversion Approach](https://consensus.app/papers/details/c6438238810a5e1f90f6fba1b0dcce84/?utm_source=unknown) (Huchen Yang et al., 2025, ArXiv label, 3 citations reported by Consensus).

F2 returned the same DOI, `10.1016/j.jcp.2025.114469`, with a Journal of Computational Physics venue label and 2 citations: https://doi.org/10.1016/j.jcp.2025.114469. Its reported citation trajectory contained 2 citations in 2026; this is not enough to infer a field trend. No primary text was read for P2. Preserve the metadata disagreement and both discovery records; one work found twice does not independently corroborate its claims.

### D2: repair can recover foundational rather than novel work

The repaired query's first lead was [A Theoretical Framework for Calibration in Computer Models: Parametrization, Estimation and Convergence Properties](https://doi.org/10.1137/151005841). This is an on-topic retrieval observation only. The returned abstract concerns a particular calibration target and consistency result; no theorem was verified here. The recovered neighbours do not establish whether the exact proposed independently anchored neural method exists.

## Pilot review delta

- Baseline §8's distinction between forward emulators, inverse networks, discrepancy learners and inference approximations remains a necessary comparison rule; **not rechecked as a literature-wide claim**.
- Add P1 to the reading queue for §8/§12 coverage repair. Its publication predates the baseline status date, but the baseline search cutoff is unknown; do not call it newly published since the last search.
- Keep baseline reference 14's inaccessible 2026 theorem **unresolved**; this pilot did not inspect it.
- No claim of a new trend or an established research gap is warranted from these requests.

## Proposed next scientific decision

[PROPOSAL] Before promoting “neural KOH” as a contribution, compare the proposed discrepancy learner with P1 and other direct alternatives on the **inference target and separation assumptions**, not just whether both use neural networks.

An example falsification-oriented candidate is an evaluation of independent anchoring under controlled discrepancy mismatch. A fair comparison would hold observation information, priors and data splits fixed, and test physical-parameter recovery, prediction and uncertainty separately. Reject an identifiability-improvement claim if predictive gains coexist with unchanged/worse parameter ambiguity, or if gains arise solely from extra prior information unavailable to baselines. This is a candidate evaluation design, not a demonstrated novelty or performance result. The specific anchors, parameter definitions and acceptance tolerances remain scientific choices.

## Verification boundary

Live checks exercised both search connectors, off-topic screening, query repair, a duplication-query failure/repair, DOI overlap, baseline lead lookup, and primary-source classification. The authoring host's own skill loader discovered `research-ideas`, parsed its update invocation, and built its prompt with no warnings for this skill. Repeat that discovery/invocation check in whatever host this skill is installed into; it is not inherited from the pilot.

Not exercised: a full all-family update, systematic screening, exhaustive version resolution, all seven FastTrack tools, a complete idea challenge through both engines, numerical reproduction, or behavior across unrelated disciplines. The skill implements instructions for these paths; this pilot does not claim they have all been validated.
