---
name: research-workflow
version: 1.0.0
description: Organize research questions, investigations and evidence; use for experiment planning/reporting, comparative-training and resumability checklists, literature handoff/integration, ablation sprawl and Quarto sites. Not a literature-search or experiment launcher.
compatibility: Use each project's environment and execution conventions on macOS or Linux. Quarto is optional; no shared account, filesystem, tracker or package manager is assumed.
metadata:
  author: "Hyunwoo Kwon <hwkwkon1114@gmail.com>"
  tags:
    - research
    - workflow
    - experiment-tracking
    - methodology
---

# Research workflow

Make the scientific argument understandable and its evidence traceable. Start from the question, not a dashboard of unexplained metrics.

## Purpose

Structure computational research inquiries, comparative experiment plans, and evidence synthesis following a disciplined scientific reading order, preventing premature claims, untested regressions, and data contamination.

## Inspect and adapt

Read project instructions and relevant existing reviews, notebooks, runners, configurations and reports before changing them. Preserve user work and safeguards; ask only for blocking information. Projects own paths, schemas, environments and resources. Do not connect projects, accounts, machines or data stores without authorization, or infer portability from one host's success.

## Scientific alignment and restored research state

Before implementing a new investigation, read the authoritative objective and
active record; use [research control](references/research-control.md) to connect
possible outcomes to the scientific decision and bound supporting diagnostics.
Restore this state after compaction/resumption or branch changes, before new
stages and expensive execution, and in delegate handoffs. Reuse existing records;
ordinary edits and maintenance do not require an experiment protocol. Scientific
alignment precedes the numerical/training gates; passing them cannot make an
irrelevant experiment relevant.

## Organize the argument

**Foundations → Literature → Research questions → Investigations → Findings → Evidence**

This is a reading order, not a mandatory directory tree:

- **Foundations:** intuition, assumptions, definitions, equations, worked examples and limits.
- **Literature:** established results, disagreements and access limits—not just citations.
- **Questions:** precise targets, motivation, competing explanations and open decisions; proposals are not contributions or novelty verdicts.
- **Investigations:** replication, benchmarking, diagnosis, method development or theory, as the question requires.
- **Findings:** supported conclusions, negative outcomes, qualifications and next decisions. Separate observations, derivations, interpretations and proposals.
- **Evidence:** selected notebook sections, figures, diagnostics, run records and paper provenance behind the explanation.

Apply only what the task needs; a small coding change does not require a site or a document suite.

## Load guidance by task

- Plans, ablations, results indexes or paper mappings: [investigations and evidence](references/investigations-and-evidence.md).
- Teaching notebooks or selected code/results: [notebooks](references/notebooks.md).
- Before comparative training or long runs, when reviewing/resuming them, and before test release: [training and checkpoints](references/training-and-checkpoints.md) for evidence gates, plus [execution environments](references/execution-environments.md) for job management.
- Before literature delegation and when integrating a handoff/update: [literature integration](references/literature-integration.md).
- Quarto configuration, rendering or navigation: [Quarto](references/quarto.md).
- Plots and figure review: use `scientific-visualization`; PDF inspection: use `pdf-read`.

Literature models, delegation and escalation follow the host's routing policy, not this skill. Reorganizing saved reviews needs no new search: inspect the relevant material completely, preserve access labels, distinguish inherited claims from new checks, and version/hash copied material so teaching content does not silently drift.

## Implement and report minimally

Reuse working runners and schemas; settings variants usually need configurations, not copied scripts. Different investigations may justify different analyses. Do not impose new infrastructure without a demonstrated need.

Keep generated bookkeeping tied to one authoritative source, separate from human interpretation. Preserve IDs, failures, missingness, numerical diagnostics, pairing and source/data identities. Historical imports are not new executions; current hashes do not prove historical generating code.

Report completed experiments with meaningful figures from saved results, including relevant controls and negative outcomes. Reuse adequate figures and use `scientific-visualization` for plotting and rendered checks. Show key figures or labeled links in the handoff. If figures cannot be produced, state partial reporting and the blocker; do not fabricate evidence or launch more experiments to fill the gap.

Report operational status precisely: proposed, implemented, tested (with scope), launched, execution-complete, and scientifically reviewed are different states. Verify existing artifacts and current job state before reporting progress; time-stamp changing run status. A plan or promise is not execution evidence, and an empty tool return is not a completed handoff.

Deliver changed paths, checks actually performed, limitations and the next decision. Plans, sites and successful renders do not validate science or authorize experiments, sweeps, installations, public deployment, transfers or destructive cleanup. Respect explicit execution scope; these instructions are not automated hooks.

## Examples

Investigation-note template (planning example, not an approved experiment):
```text
Question: [predeclared target, independent sampling unit, evaluation conditions]
Alignment: [objective link, competing explanations, decision under each outcome]
Authority: [approved scope, non-goals, information limits, next permitted action]
Comparators: [provenance, scaling, optimization and regularization for each]
Design: [group-safe splits, validation selection/stopping and sealed test release]
Execution gate: [representative loss/gradient checks and tested resumability]
Budget: [authorized per-fit and aggregate ceilings justified by measured feasibility]
Evidence: [actual run IDs, curves, checkpoints, failed cells and unresolved limits]
Status: proposed; no launch or test release implied by this template
```

Other inquiry types require different evidence, not a renamed training checklist:

- **Replication request:** identify the exact published version and protocol, inventory existing code/data and departures from the source, then propose a matched comparison and discrepancy record. Label unavailable source details as blockers; a matching plot alone is not reproduction evidence. Do not launch a new run without authorization. See `references/investigations-and-evidence.md`.
- **Failure diagnosis request:** record the observed failure and rival explanations, inspect existing logs and numerical checks, and propose the smallest distinguishing intervention with a predeclared expected observation for each explanation. Report untested explanations as open, not disproven. See `references/investigations-and-evidence.md`.
- **Saved literature-update handoff:** identify the authoritative existing review and requested delta, give the reviewer its absolute paths and constraints, and integrate only a usable returned artifact while preserving IDs, provenance and qualifications. A proposed delta is not an integrated result. See `references/literature-integration.md`; this skill does not conduct the search.

These are planning scenarios, not completed experiments or evidence that any source was checked. Read `references/training-and-checkpoints.md` before implementing a comparative runner. Its gates are requirements to verify in code and evidence, not automatic guards supplied by this skill.

## Limitations

- Organizational framework only: Provides discipline, gates, and documentation structure; it does not replace scientific domain knowledge or statistical expertise.
- Not an autonomous runner: Does not launch unapproved runs, expand parameter sweeps, or manage compute jobs without explicit user authorization.
- Project local: Adheres strictly to the active project repository's conventions and boundaries without imposing external trackers.

## Troubleshooting

| Obstacle | Cause | Solution |
|---|---|---|
| `Numerical divergence / NaN loss` | Learning rate too high, gradient explosion, or unstable ODE solver step | Inspect gradient norms; test smaller step-size or gradient clipping |
| `Ablation sprawl / Budget overrun` | Testing all combinatorial parameter variations without gating | Declare primary research question; prune secondary axes until primary is answered |
| `Data leakage across splits` | Preprocessing statistics computed across entire dataset | Fit scalers and normalizers strictly within training folds |
| `Checkpoint resume failure` | Checkpoint missing optimizer state, RNG key, or epoch counters | Save complete state dict including model weights, optimizer, and RNG state |
