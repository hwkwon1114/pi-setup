# Decision log (full record)

Full verbatim record of every decision; authoritative on any conflict with the short list in `DECISIONS.md`.
One row per researcher decision (or researcher-accepted design choice). A superseded rule is never deleted: its
status changes and it points to its successor. Sources: `m…` = session message refs, `questionnaire <date>`, or a file.

Status: **active** | **superseded → D-xx** | **open** (awaits researcher).

## Decisions

| ID | Date | Decision | Rationale / limit | Status | Source |
|---|---|---|---|---|---|
| D01 | {{DATE}} | Project created with `/lab-init`: card workflow (`cards/TEMPLATE.md`), critic before approval and for result audits, independent verifier before expensive runs, `DECISIONS.md` short list + this full log, one-screen `RESEARCH_STATE.md`, GPU policy in `.pi/lab.json` (initial defaults; review). | Shared research harness (pi-setup `packages/lab/scaffold`). | active | `/lab-init` |
