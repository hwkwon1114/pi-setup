# {{PROJECT}}: project instructions

Created {{DATE}} by `/lab-init`. Fill in the objective; keep this file short (it is loaded on every request).

## Objective and claim boundary

<What the project is trying to achieve, the main intended contribution, and which claims must be kept separate
(for example prediction accuracy vs causal/physical attribution vs safety). Negative results and
non-identifiable outcomes are valid progress.>

## Session start

Read this file, `RESEARCH_STATE.md`, `DECISIONS.md` (short list of current rules; full rows in `DECISIONS_LOG.md`,
which win on conflict) and the active card at session start, after compaction/resumption or branch changes, before
new stages and before expensive execution. Reuse the active investigation rather than reviving queued experiments;
preserve historical evidence and qualifications.

## Card workflow

Every investigation is a card from `cards/TEMPLATE.md`, approved by the researcher before implementation.

1. **Card** (orchestrator + researcher): question→decision table, information table, numbered formulas F<n>,
   ablation matrix, known-answer checks, predictions, gate. **Critique:** before approval, the `critic` subagent
   (read-only, `cards/CRITIC_PROMPT.md` mode A) reviews the draft → `cards/critique/<ID>_card_<date>.md`. The
   researcher sees card and critique together and decides.
2. **Implement** (`worker` or orchestrator): only within the card's edit boundary; tag implementing lines `# F<n>`;
   write the card's known-answer tests.
3. **Verify** (`verifier` on a different model family from the writer, fresh context, read-only,
   `cards/VERIFIER_PROMPT.md`): F-ID → `file:line` → test, mismatches, spec gaps, leakage paths →
   `cards/verification/`. Before training, sweeps or expensive simulation on new/changed code, `BLOCKING ISSUES`
   must be fixed and re-verified. Launch long jobs with `job_start` (GPU policy `.pi/lab.json`).
4. **Run**, then **audit**: recompute reported numbers from raw outputs and check data roles before filling §9;
   then `critic` mode B (RESULT AUDIT) → `cards/critique/<ID>_results_<date>.md`; unresolved findings go into the brief.
5. **Brief**: filled ablation table, prediction vs outcome, failed checks, ≤3 decisions, each explained in plain
   words. Record researcher answers as decisions (full row in `DECISIONS_LOG.md`, one line in `DECISIONS.md`).

A new rule goes into the log the same way (never only into prose); a superseded rule is marked in the log, not
deleted. Keep `RESEARCH_STATE.md` to one screen (the lab state block injects only its first 6000 characters).

Repo hygiene: `ACTIVE.md` lists what is current; `.ignore` hides retired paths from search (nothing deleted).
Commit per card at verification and at results and cite the commit ID in run records.

Session hygiene: one Pi session per card (`/card <ID>`); keep the card's `Stage:` line current and write its §8 run
record (exact commands, job IDs, outputs, code identity) before launch. Anything not in a file may be lost to
context compression.

After each completed experiment, run `EXPERIMENT_ANTI_DRIFT_CHECKLIST.md` before strengthening README or
manuscript claims.

## Outputs and figures

- Generated results, figures and diagnostics go in Git-ignored `outputs/`.
- Figures: legible text at the intended display size (see the `scientific-visualization` skill); inspect renders
  for overlap and clipping.

## Development autonomy and research fairness

Iteration, repair attempts and tool-call counts are not budgets: within the agreed card, repair, test and review
autonomously until the scientific decision or a genuine blocker. Keep per-process timeouts and memory protection;
diagnose a timeout rather than blindly retrying. Consult on substantial unplanned compute or scope changes.

Fairness is mandatory: matched information access and declared comparator selection/tuning opportunities,
development/final-test separation, preserved failures, predeclared evaluation and stopping rules, independent review
before consequential execution. Never tune on final tests or alter acceptance criteria to pass.

## Environment

<Language/runtime version, how to run CPU-only tests, dependency rules, data locations.>
