---
name: research-workflow
description: Organize research questions, investigations and evidence; use for experiment planning/reporting, comparative-training and resumability checklists, literature handoff/integration, ablation sprawl and Quarto sites. Not a literature-search or experiment launcher.
compatibility: Use each project's environment and execution conventions on macOS or Linux. Quarto is optional; no shared account, filesystem, tracker or package manager is assumed.
---

# Research workflow

Make the scientific argument understandable and its evidence traceable. Start from the question, not a dashboard of unexplained metrics.

## Inspect and adapt

Read project instructions and relevant existing reviews, notebooks, runners, configurations and reports before changing them. Preserve user work and safeguards; ask only for blocking information. Projects own paths, schemas, environments and resources. Do not connect projects, accounts, machines or data stores without authorization, or infer portability from one host's success.

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
- Before comparative training or long runs, and when reviewing/resuming them: [training and checkpoints](references/training-and-checkpoints.md), plus [execution environments](references/execution-environments.md) for job management.
- Before literature delegation and when integrating a handoff/update: [literature integration](references/literature-integration.md).
- Quarto configuration, rendering or navigation: [Quarto](references/quarto.md).
- Plots and figure review: use `scientific-visualization`; PDF inspection: use `pdf-read`.

Literature discovery follows the host's reviewer routing, not this skill. Reorganizing saved reviews needs no new search: inspect the relevant material completely, preserve access labels, distinguish inherited claims from new checks, and version/hash copied material so teaching content does not silently drift.

## Implement and report minimally

Reuse working runners and schemas; settings variants usually need configurations, not copied scripts. Different investigations may justify different analyses. Do not impose new infrastructure without a demonstrated need.

Keep generated bookkeeping tied to one authoritative source, separate from human interpretation. Preserve IDs, failures, missingness, numerical diagnostics, pairing and source/data identities. Historical imports are not new executions; current hashes do not prove historical generating code.

Report completed experiments with meaningful figures from saved results, including relevant controls and negative outcomes. Reuse adequate figures and use `scientific-visualization` for plotting and rendered checks. Show key figures or labeled links in the handoff. If figures cannot be produced, state partial reporting and the blocker; do not fabricate evidence or launch more experiments to fill the gap.

Deliver changed paths, checks actually performed, limitations and the next decision. Plans, sites and successful renders do not validate science or authorize experiments, sweeps, installations, public deployment, transfers or destructive cleanup. Respect explicit execution scope; these instructions are not automated hooks.
