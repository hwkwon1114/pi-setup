# Optional evidence-backed observations

Capture only when the user requests maintenance/capture or explicitly enables observation for a task. Do not silently activate across all sessions. Logging a hypothesis does not approve applying it to future work.

## Storage

Default: `~/.pi/agent/skill-maintenance/observations/`. Check for an existing configured maintenance workspace before creating another. Keep it outside project temp directories and skill discovery paths. Resolve its absolute path in each tool call; do not rely on previous shell variables.

Use one JSON file per observation, with a UUID filename and matching id. Use exclusive creation (Python open mode `x` or equivalent) and validate before writing. UUIDs avoid a shared numeric counter; they do not prevent races when updating the same file. Assign a single writer for updates, re-read immediately before editing, and stop on baseline drift. Do not claim transactional multiwriter safety without locks or a transactional store.

No helper is bundled for storage yet. Use an inspected small script or existing file tools for bounded operations; record concurrency limitations rather than implying enforcement.

## Record fields

- id, created_at, title.
- visibility: private by default; public-ready only after explicit sanitization/review.
- evidence: durable file/section or saved minimal reproduction, with hash/version where relevant. If evidence is unavailable, say so.
- finding_kind: observed defect, reproduced failure, static risk, preference, or hypothesis.
- issue, proposed_change, generalizable_principle.
- targets: each skill's name/path, affected section, and separate state (open, staged, installed, verified, declined, superseded, parked).
- siblings_checked: members considered and applicability reasons; no-family is a legitimate explicit result.
- verification_plan: what would support or refute the proposal.
- approval: exact scope authorized, or pending.
- parked_until: a checkable condition for any parked target.
- resolution: actual action and evidence, not an intention.

Missing/malformed status is an unclassified record needing review, not an invisible entry or an automatic permission to act. Enumerate files independently of filtering; flag parse failures and explain count mismatches. JSON parsing should fail visibly.

## Review

Read bodies before merging, declining, or adopting findings. Group by underlying decision, not title similarity. Compare with current skill contents to avoid repeating an already-applied fix. Recheck hypotheses and parked conditions. A proposed rule cannot override the current approved workflow just because it appears in an open observation.

Consider whether a correction generalizes beyond this task, whether it belongs in configuration rather than methodology, and whether a sibling really shares the same requirement. Repeated friction is useful evidence; one severe reproducible safety defect can justify action without waiting for recurrence.

Keep proposed/staged/installed/verified distinct. Do not archive or delete automatically. For a bounded review record which files were included and whether a final rescan found new entries. An honest partial review is better than a false clean backlog.
