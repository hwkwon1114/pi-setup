# Dynamic native compaction handoff

Historical handoff, 2026-10-02. The native fallback described below remains; the later todo/billion-context runtime owns conversations it routes (see the root README). SoL-Pi is no longer loaded. Original checks and qualifications below are preserved as dated evidence, not repinned as current whole-runtime validation. Raw logs and machine-specific integrity receipts remain local and are excluded from publication.

Checked 2026-10-02 UTC. Maintenance only: Pi 1.0.0 / Node v26.8.2. No scientific experiment, live provider, independent reviewer, account change, dependency update, or new SoL-Pi mechanism.

## Decision and change

The custom usage extension called the **manual** `ctx.compact()` API at 150,000 tokens. That aborts the active loop; its hidden `context-compaction-resume` message started a replacement continuation. Removed that controller and continuation. The extension now only updates usage display at turn boundaries.

Native automatic compaction is the sole normal controller. It triggers when projected context exceeds the selected model's `contextWindow - reserveTokens` (default reserve 16,384), checks after tools finish before the next response and before new user prompts, and continues the existing run. Native settings, including disablement and exact provider/model token overrides, remain authoritative. Manual `/compact`, cancellation, compaction failure, and provider overflow recovery are distinct paths; no guarantee that all abort notices disappear.

Removed all seven local `contextWindow` overrides in active and portable `models.json` (five 150k and two 100k entries), so catalog/provider context metadata is used. Preserved every 32k/24k output cap. No credentials, model selection, settings, roles, review gate, literature extension, usage polling policy, or SoL-Pi configuration changed. The active usage source is linked to the portable source.

Backup: `/Users/hyunwoo/.pi/agent/backups/dynamic-compaction.zuob8u2a/` (original source, models, settings, README and tests; SHA-256 receipt).

## Actual checks

- `checks/offline-01.log`: **12/12 passed, zero skips**. Display-only assertions cover UI/headless, different windows, the former 150k boundary, unknown usage, successful/final/error/aborted turn metadata. Native threshold checks cover model windows, equality boundary, reserve overrides and disablement.
- Installed SDK/faux-provider fixtures assert completed tools before threshold compaction, one low-level agent run, no `agent.abort()`, no custom continuation messages, no replay or extra faux main responses, settled final result and no extension errors. Network fetch is forbidden by the fixture.
- Small synthetic window: 3 faux responses, 2 native threshold compactions. Multiple native threshold checks are allowed; this fixture does not establish minimal compaction frequency. This is **not** an exactly-once-compaction claim.
- Large synthetic window: same scripted workload, 3 responses and no compaction; switching to the small window before another user prompt triggers 1 native threshold compaction and the fourth scripted response.
- Retained fixtures: `/var/folders/kq/5sqlx2zs0wlfnkrq3sl_gt0h0000gn/T/pi-dynamic-compaction-small-kDNDOT/` and `/var/folders/kq/5sqlx2zs0wlfnkrq3sl_gt0h0000gn/T/pi-dynamic-compaction-large-coWqGa/`. Each has result/events JSON. Repository reruns create their own retained temporary fixtures.
- `checks/repository-01.log` and final documentation rerun `checks/repository-02.log`: **38 checks passed, zero failures** each, including literature, reviewer-gate, usage, research-control and scratch install/export regressions.
- `git diff --check`, active/portable source equality, model equality, unchanged settings and preserved output caps are recorded in `checks/integrity.json`.
- Two attempted non-unique model edits were rejected before mutation; corrected with provider-qualified exact replacements. No failing test or concealed test rerun.

## Interpretation / claim boundary

Evidence is offline lifecycle compatibility, not real-provider context-limit verification, summary fidelity, efficiency, cost, long-context quality, or scientific validation. Synthetic SDK models use 8k/64k windows and fixture-only 1024 reserve/256 retained-token settings to force boundaries. Summaries are deterministic test hooks; the deployed controller uses ordinary native summarization. Catalog metadata must accurately describe the endpoint. Oversized tool results may overshoot a threshold, and failed/cancelled compaction is not made infallible by this change.

No interactive `/reload`, model re-selection or restart has been observed. To activate in an existing session, use `/reload`, then `/model` and reselect the current model to obtain refreshed metadata; restarting Pi also activates both changes. Original summaries, historical test logs and SoL-Pi experiment reports remain historical evidence and were not repinned.

## Maintenance anti-drift checklist

Authority inspected: `/Users/hyunwoo/Documents/physical-identifiability-discrepancy/EXPERIMENT_ANTI_DRIFT_CHECKLIST.md`.

- Run/path: `pi-setup/tests/usage-compaction`; question: remove fixed manual-abort controller and use native model-aware thresholds; architecture: other/runtime maintenance; estimand: lifecycle behavior, not prediction or physical parameters; deployed object: usage display plus upstream native controller.
- Sections 1–6 and the scientific claim types in section 7: **N/A** (no FE, training, calibration, observations, physics, forecasts or identification claims).
- Section 7: original scientific qualifications/evidence untouched; no superseded run used to establish the new lifecycle behavior.
- Section 8: engineering regression tests, not a preregistered scientific comparison; original files backed up; test logs/fixture settings preserved; interpretation limits above. No figures, seeds, datasets or checkpoints apply. No scientific README/VALIDATION/manuscript changes.
- Failures: none applicable; missing coverage is explicitly listed above, not presented as passed.
- One-line decision: **revise runtime claim only**—native model-aware compaction replaces the fixed abort/restart mechanism. Next operator action: reload/reselect or restart. Blocked on: unobserved interactive activation and untested live summary quality, neither required for this offline handoff.
