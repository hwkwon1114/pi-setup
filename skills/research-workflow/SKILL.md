---
name: research-workflow
version: 1.2.0
description: Organize inquiry, problem framing, evidence and handoffs across disciplines. Use for project kickoff, exploration planning, restoring investigation state, experiment planning/reporting, literature integration and research sites. Not required for ordinary edits; not a literature-search or experiment launcher.
compatibility: Follow the project's environment and execution conventions. Quarto is optional; no shared account, filesystem, tracker or package manager is assumed.
metadata:
  author: "Hyunwoo Kwon <hwkwkon1114@gmail.com>"
  tags:
    - inquiry
    - workflow
    - evidence
    - methodology
---

# Inquiry workflow

Help find the next useful question, idea or piece of evidence. Anchor the work in the user's intent, not in one discipline, method or mandatory sequence.

## Orient without creating paperwork

Read project instructions and the relevant existing question, notes and evidence. Establish what the user wants to understand or change, what is uncertain, and the next useful action. A provisional question is enough for exploration; do not demand an estimand or experiment protocol before thinking.

Reuse the existing record. Restore its objective, decisions, limits and next action after compaction/resumption or a handoff, and before consequential implementation or expensive execution. Ordinary edits and maintenance do not require an experiment protocol. Keep only state needed to continue accurately; no new dashboard, catalog or document suite by default.

## Start with a purpose anchor

At a new research project's kickoff, or when an existing project lacks a clear
purpose anchor, use [project kickoff](references/project-kickoff.md). Capture the
researcher's long-term purpose, evidence for progress, non-goals and first useful
question before committing to experimental implementation. Reuse existing notes;
one document can hold both the objective and current investigation. Exploration
may begin with a provisional question; do not invent a settled objective or force
an experiment, numeric metric, fixed budget or document suite.

## Explore broadly; commit deliberately

Explore alternative framings and mechanisms from other fields when they illuminate the problem. Use `cross-domain-idea-transfer` for structural analogies and translation; it is optional, not a prerequisite for every inquiry. Borrowing an idea does not itself change the objective or authorize a new experiment. Explicit user changes can revise the objective; preserve the rationale rather than enforcing a stale goal.

Choose the next action by what it could distinguish: inspect a source, work through an example, derive a consequence, find a counterexample, or propose a small test. Do not substitute an easy metric for the actual question. Exploration and evaluation can alternate; there is no mandatory phase ladder.

Before implementing a new scientific investigation or committing to execution, use [research control](references/research-control.md) to connect outcomes to the decision and check the applicable host requirements. Reuse existing authorization without repeated procedural approvals; material scope/recipe changes still follow the host's policy.

## Load only the guidance needed

- Session todos, compression and context restoration: [research control](references/research-control.md#todos-and-compressed-context).
- Investigation design, ablations, run/evidence records and completed-experiment reporting: [investigations and evidence](references/investigations-and-evidence.md).
- Comparative training or long runs, including review, resumption and test release: [training and checkpoints](references/training-and-checkpoints.md); for execution/job management, [execution environments](references/execution-environments.md).
- Before literature delegation or integration of a returned update: [literature integration](references/literature-integration.md). Saved-material reorganization needs no new search.
- Teaching or editing notebooks: [notebooks](references/notebooks.md).
- Quarto configuration, rendering or navigation: [Quarto](references/quarto.md).
- Analysis: `exploratory-data-analysis` or `statistical-analysis`; plots: `scientific-visualization`; a supplied paper: `paper-summary` with `pdf-read` for PDFs.

Literature routing, reviewer authorization and execution permissions remain with the host. This skill supplies neither agents nor runtime guards.

## Synthesize and hand off

Separate source statements, observations, derivations, interpretations and proposals. Preserve provenance, disagreements, failures, negative outcomes and unresolved limits. Reuse working runners and schemas; do not add infrastructure without a demonstrated need. In particular, never invent distributed cluster harnesses (POSIX file locks, crash-gap watermarks, pre-update atomic ledgers, micro-second profiling envelopes) for fast local benchmarks or toy ODEs (< 15 min runtime). Focus on the scientific question, not cluster DevOps.

Explain what changed, what was actually checked, what the evidence supports and the next useful action. Proposed, implemented, tested, launched, execution-complete and scientifically reviewed are distinct states. Check artifacts and current job state before reporting progress; a plan, empty tool return or successful render is not verification.

Save a note only when requested or needed by the existing project workflow. Update one current entry point rather than competing reports; preserve researcher notes and history. This is guidance for judgment and coordination, not an automatic monitor or permission grant.
