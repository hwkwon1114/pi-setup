# Reviewer authorization: implementation check record

## Initial scope and decision (retained)

Implement the approved explicit code-review launcher, leave Action Fusion validation optional, and remove only the recently added `Implementation checks` paragraph after offline gate checks. No live reviewer, provider request, new npm installation, credentials/account changes, or scientific experiment is authorized/performed. No independent reviewer audited this implementation; these are implementing-assistant checks.

The initial implementation required inspected pi-subagents 0.74.0; the authorized latest-first follow-up below supersedes that numeric pin. The main ceiling remains closed to code-review identities while the command's separate host launches one configured ordinary/safety leaf. Execution completion is not a review/experiment approval verdict. See `README.md` for commands, scheduling restrictions, bypass boundary and provider inheritance.

## Evidence and failures retained

- `checks/integration-01.log`: initial integration skipped because executable discovery used the wrong directory depth. A skip was not a passing compatibility check.
- `checks/integration-02.log`, `checks/integration-03.log`: standalone SDK/package-root and frontend-vs-tool-result assertion/debugging failures retained. Fixtures use supported `PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT`, not an invented alternative. `tools.subagent` is not exposed to Codemode; nested coverage uses a fixture-only proxy sending real package delegation RPC.
- `checks/integration-04.log`: failed exact model identity assertion; package receipt appended `:high`. Route assertion now removes only recognized thinking suffixes, retaining exact provider/model comparison. No product routing failure inferred.
- `checks/integration-05.log`: original package integration passed; ordinary and safety faux commands executed once each. No live reviewers.
- `checks/gate-06.log`: 14/14 passed, including the actual `index.ts` loaded by the installed SDK and package-owned shutdown cleanup.
- `checks/gate-07.log`: 17/17 passed, including SoL-Pi Action Fusion with both fused and unfused writes, a real package-owned active faux child cancellation, and fail-closed unsupported-version/catalog-policy checks. Ordinary/safety faux executions plus one cancellation fixture are synthetic diagnostics, not substantive reviews.

Fixture paths are retained in the logs; task/request/result/reports are in those temporary agent homes. Initial iterations were maintenance debugging, not a frozen comparative experiment; current test source includes post-observation corrections. Logs were not replaced to conceal failures. No live retry occurred.

## Original verification (0.74.0, retained)

Final focused gate: **18/18 passed**, no skips (`checks/gate-09.log`), on Pi 1.0.0, Node v26.8.2, pi-subagents 0.74.0. Optional SoL-Pi integration passed both fused and unfused writes. Repository-wide offline suite: **37 checks passed, zero failed** (`checks/repository-02.log`), including literature dispatch/lifecycle, usage/150k compaction, research-control regression and scratch install/export tests. `git diff --check` passed. Earlier post-gate runs (`gate-08.log`, `repository-01.log`) also passed; retained rather than overwritten. A subsequent source check strengthened unavailable-API session-change handling and rejected command-owner scheduling roots; final checks include those changes. Lifecycle/session-isolation/reload checks are policy-unit fixtures, not observed interactive `/reload`. Runtime integration verifies direct, alias, opaque foreground workflow, nested Codemode-to-RPC, main structured-RPC, retained worker delegation, explicit ordinary/safety commands, and cancellation. Arbitrary detached workflows, durable scheduler recovery, active competing-policy integration and real authentication/model quality are not certified. Scheduling-root rejection is a unit check, not a due-job experiment.

Both active and portable AGENTS were backed up to `/Users/hyunwoo/.pi/agent/backups/review-gate.dWvPtG/`, then the added paragraph was removed **after** gate-07 passed. Byte comparisons match the pre-paragraph backups in `/Users/hyunwoo/.pi/agent/backups/action-fusion-default.IgruK2/`. Settings comparison against that backup confirms only the previously authorized SoL-Pi package addition; default providers/models and all other settings remain unchanged. SoL-Pi remains Action Fusion only. The main usage-limit guard and literature extension were not edited.

## Latest-first follow-up (2026-10-02 UTC)

User authorization: always prefer latest pi-subagents, adapt compatibility, and consider our own fork only if upstream cannot support the policy. No background updater or live review was authorized/performed.

- Installed **0.75.0** using exactly `pi update npm:pi-subagents@latest --no-approve` (`checks/latest-install-01.log`). Both personal/portable package declarations remain `@latest`; settings did not change. Lockfile comparison finds only pi-subagents changed (0.74.0 → 0.75.0), not Pi, other packages or unrelated dependencies.
- Backup: `/Users/hyunwoo/.pi/agent/backups/subagents-latest.5owg1de_/` contains the pre-update npm tree, settings and original gate sources/checks. The staged registry tarball was SHA-512 verified; registry metadata and provenance receipt remain there.
- Staging failure retained in task history: the local Python lacks `TarFile.extractall(filter=...)`. Reused the already downloaded verified tarball; extraction explicitly rejected absolute/traversal/non-regular members and stripped special permissions. No install/provider retry resulted.
- Inspected complete 0.75.0 integration API docs and relevant changelog entries. Public ceiling/delegation modules and the shared ceiling implementation match 0.74.0 byte-for-byte; discovery changed elsewhere but its used callable remains compatible. This is narrow same-seam evidence, not full-package certification.
- Removed the numeric pin. `compatibility.mjs` probes required functions/events and ceiling behavior in two isolated random session IDs, disposes all temporary registrations, and performs no I/O, SDK session creation or provider calls. Incompatible APIs still fail closed where the usable public ceiling seam remains; session-change fallback coverage is retained.
- A synthetic **99.0.0** package fixture re-exporting the actual installed APIs passes the loader, demonstrating no version allowlist. It does not validate a real future release. Missing methods/events and changed intersection behavior fail, with probe cleanup verified.
- `checks/latest-gate-01.log`: **25/25 passed**, no skips, with real 0.75.0 package + installed Pi SDK, faux providers only, and optional SoL-Pi fused/unfused writes. It retains one ordinary and one safety synthetic reviewer execution plus one cancellation fixture; no live reviewer/provider request.
- Final focused rerun `checks/latest-gate-02.log`: **25/25 passed**, no skips; saved request metadata also identifies package 0.75.0 and the passed compatibility contract. Repository-wide `checks/latest-repository-01.log`: **38 checks passed, zero failures**, including literature, usage/compaction, policy and scratch install/export checks. `git diff --check` passed. Final registry verification at 2026-10-02 22:37 UTC still reports 0.75.0 as latest. Settings/AGENTS/SoL-Pi feature checks pass unchanged. `checks/latest-integrity.json` records current provenance; original logs/manifest remain original-version records and are not silently repinned.
- npm reported **one moderate existing dependency vulnerability**, confirmed by `checks/latest-audit-online.json`: `fast-uri` 3.1.7, [GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj). `checks/latest-audit-dependency.json` traces it through `pi-mcp-adapter` → `ajv` → `fast-uri`; these versions were unchanged. No `npm audit fix` or unrelated upgrade was run. The offline audit returned zero findings (`latest-audit-offline.json`), which was **not** treated as evidence of safety because the online install/audit contradicted it.

**Decision:** keep latest upstream; no fork is needed for 0.75.0. Runtime probes are bounded compatibility checks, not a universal authorization/security certificate. Full regression checks remain the upgrade acceptance step; API breakage calls for adapter/minimal-fork work, not an unannounced downgrade, config change or policy disablement. Normal `/reload` activation and live auth/review quality remain unobserved.

## Anti-drift / claim boundary

| Header | Value |
|---|---|
| Run/path | `extensions/review-gate/` maintenance handoff |
| Question | Are configured code-review identities command-authorized while optional fused validation and normal worker delegation work offline? |
| Architecture / estimand | Other: runtime launch policy; deterministic synthetic outcomes, no scientific estimand |
| Deployed object | Extension linked into agent resources; normal-session activation not observed |
| Date checked | 2026-10-02 UTC; maintenance only |

Checklist sections 1–6: N/A (no FE, physics, identification, training, data adaptation or calibration). Section 7: no scientific, efficiency, general model-compatibility or review-quality claims; failed/skipped iterations remain labeled. Section 8: maintenance tests are corrected during debugging, not pre-registered; sources/logs/fixtures retained; no quantitative figures or scientific checkpoint/split artifacts. This record supplies the claim boundary and outstanding checks. No project README/VALIDATION/manuscript/knowledge-index claims were changed.

**Keep:** narrow offline runtime checks only. **Next action:** operator `/reload` if this documented launch/scheduling policy is acceptable; the bounded offline handoff is complete. **Open decisions/limits:** scheduled subagent delegation is restricted by the upstream ceiling mechanism; training requests do not by themselves unlock command-only safety reviewers; differently named agents/arbitrary shell launches are outside this non-OS-sandbox policy. Future pi-subagents upgrades follow the latest-first compatibility/regression procedure above; there is no numeric version pin. Required safety review and parent acceptance remain requirements, not capabilities automatically granted by this extension.
