# Literature reviewer for Pi

A user-owned Pi extension providing one specialist role and bounded nested delegation. No other agent roles are installed. The profile lives in literature-reviewer.md and is read fresh for each dispatch. This is a dedicated extension, not a general loader for arbitrary agents/*.md files.

## Use

After /reload (or restart), enter in Pi's prompt, not bash:

    /literature-reviewer update /absolute/path/to/review.md

Or ask the main assistant to use the literature reviewer. The model-callable tool is:

    literature_review({task: "A bounded research question, scope, constraints and absolute source paths"})

The command routes through the main assistant so it can supply context. Children do not inherit conversation history; the dispatch task and named source files are their inputs. Model/thinking routing is explicit: Astra/xhigh for the coordinator and Sol/medium for leaves, rather than session inheritance. The existing Cursor/Antigravity providers are explicitly loaded if installed; built-in providers remain available. No new provider packages installed.

## Assignment

Only research-ideas and pdf-read are explicitly loaded. Research-ideas resides under ~/.pi/agent/roles/literature-reviewer/skills/ outside global discovery; pdf-read remains globally available. The MCP adapter package is retained with empty resource filters in global settings, so it does not register main-session tools or skills. Children instantiate it explicitly as described below. pdf-read combines text extraction and selective rendering; it does not create PDF documents. Ambient skill, prompt-template, context-file and extension discovery is disabled in child Pi processes. Native providers and this extension are explicitly loaded. MCP is instantiated inside children with an isolated in-memory config containing Consensus and ResearchFastTrack only. OAuth storage is shared through the adapter's normal URL-bound secure store. If authentication expires, report the blocker to the user. The main session no longer exposes adapter auth commands by default; an explicitly authorized temporary adapter-enabled interactive session is needed for reauthentication. Preserve existing OAuth storage; child gateway auth-start/auth-complete calls are blocked.

Tools: read, bash, write, edit, grep, find, ls, mcp, literature_progress; literature_review additionally available to the top reviewer. No Zotero skill, synchronization tool, experiment agent, or skill-maintenance role is loaded. Bash remains full user-permission shell access: this is role/tool configuration, NOT filesystem/network/credential sandboxing. Prohibitions on simulations, raw agent spawning and Zotero writes are role instructions, not OS controls.

## Delegation limits

Main session → reviewer (depth 1) → child reviewers (depth 2).

- Leaf children have no registered literature_review tool.
- Main extension: at most one active reviewer; no lifetime cap on sequential, task-scoped review dispatches. Success, failure or cancellation frees the active slot.
- Each reviewer: at most four active children, four total child dispatches per process lifetime. Finishing a child frees its active slot but does not replenish this four-child budget; launched failures count too.
- Thus a single active review tree contains at most five review processes, excluding the coordinating main Pi process; at most five review processes are launched across that tree's lifetime.
- The coordinator has **no fixed wall-clock deadline**. User cancellation and session shutdown/reload abort its process group. Scope, concurrency, dispatch and output limits still apply; this is not unlimited permission to research or spend. No monetary cap is implemented.
- Each leaf receives an independent **10-minute deadline**, including startup, with its last minute reserved for finalization. A child timeout preserves partial artifacts and fails that child tool call; it does not terminate the coordinator. No automatic replacement dispatch is used.
- Budgets are recorded in invocation.json and inherited through PI_LITERATURE_DEADLINE_MS / PI_LITERATURE_FINALIZE_MS (`none`/`none` for the coordinator). Missing/malformed role budgets fail closed. Legacy finite parent budgets can shorten a child's deadline, but new coordinators do not have retrieval cutoffs. Before each model request an ephemeral notice refreshes runtime guidance. After a leaf's cutoff, new mcp calls are blocked; local reading/writing remains available. Shell-network avoidance after cutoff is a role instruction, not network enforcement. MCP requests retain 60-second timeouts; finite shell retrieval timeouts are role guidance, not a global shell cap.
- 64 MiB combined stdout/stderr cap per process, bounded returned report preview (45 KB/1500 lines, plus status/path footer), full authored report preserved separately.
- Abort terminates the POSIX root process group, with forced cleanup; children join that group. Nested child timeouts terminate the leaf process. These controls do not constrain arbitrary independent processes launched through bash; the role forbids doing that.
- Child caps are local to each reviewer process, not a cross-session global quota. A new review receives its own bounded child budget. Independent Pi sessions have separate concurrency state.

A dispatch is still a one-shot task, not a persistent two-way conversation. Follow-ups launch a new reviewer with the relevant previous reports, source paths and remaining question supplied by the main assistant. Saved evidence must be reused rather than repeating searches. Removing the main lifetime cap does not authorize automatic retry loops or splitting a bounded review into new launches to evade its child limits; failures and scope expansion still require the existing task/approval checks.

The parent owns integration; children write separate reports instead of competing edits to the corpus. Shared-file ownership rules are instructions, not path enforcement. Quotas belong to accounts and are shared by children; parallel work is optional.

## Live progress

Tool updates stream on tool start/update/end and every 10 seconds while running. They show elapsed time, active tools, per-child running/completed/failed/timed-out status and paths, and the run-local report checkpoint if it exists. The main TUI footer shows a compact activity status. Use `/literature-status` to display the latest snapshot without another model turn or interrupting the review (session-local; restart clears it).

Reviewers publish `literature_progress` at phase changes, with a short activity/blocker summary and optional cumulative screened/verified paper counts. These are explicitly **reviewer-reported**, not automatic verification or a completion percentage. Absent counts stay unknown; child counts are not summed because source sets may overlap. Only structured activity is displayed, not raw model reasoning or arbitrary tool arguments. A warning appears after three minutes without subprocess events; this may be a model/service wait, not a proven stall, and does not kill the coordinator.

Each run also has a bounded, atomically refreshed `progress.json` snapshot and full `events.jsonl` logs. The terminal snapshot records finished/incomplete status. Interfaces that do not surface streaming tool updates can inspect these local files. Progress files/logs can contain sensitive paths and reviewer summaries; keep them private. No live research was run to test the UI changes.

## Artifacts and privacy

Runs are created under ~/.pi/agent/literature-review-runs/review-*/ (or the configured Pi agent directory). Children get nested run directories. Directories use mode 0700; runner-created files use mode 0600. Agent-authored files follow the writing tool's permissions inside that private directory; task-authorized project outputs are outside this directory protection. Runner artifacts include task.md, system.md, invocation.json, events.jsonl, stderr.log, final-response.md, artifacts.json, result.json and progress.json (with progress.json.tmp used for atomic updates). The reviewer owns report.md, handoff.json and evidence files. They persist for recovery and are NOT automatically deleted. Logs may contain sensitive task/source text; do not publish them. The selected model provider receives delegated prompts and any sources read by the agent; MCP receives queries when called.

The runner never writes report.md. It preserves authored files on success, nonzero exit, timeout, cancellation and output-limit termination; final chat text goes only to final-response.md (exclusive creation). Tool-calling commentary/streaming deltas are not a completed final response. If a trivial smoke test has no authored report, a completed final response is the fallback. Without either, report is null; a placeholder is not passed off as a report.

For a substantive review, the role saves a compact partial report early and declares existing artifacts in handoff.json (version 1; status partial/blocked/complete_within_scope; optional report path; artifacts array of file paths). Declarations are limited to 64 KiB / 128 artifact entries. The runner records available, missing and rejected paths in artifacts.json; missing/invalid declarations cause a failed handoff even if the subprocess finishes. Paths must resolve to regular non-symlink files in the run tree, or, for the root only, within the project cwd. External project files are listed, never auto-read. This containment check does not grant write permission or implement a sandbox. Completion status is agent-declared, not scientific verification.

On failure the tool throws with the causal error, elapsed/budget information, partial-report preview and recovery paths; last model stop reason remains diagnostic only. result.json distinguishes processCompleted, artifactErrors and declaredStatus. A stopped run is partial regardless of stale completion wording in its draft. Reports omitted from both the run-local convention and manifest are not automatically discovered. Filesystem failure or violating a reserved runtime filename can prevent runtime metadata saving; the error still identifies the run directory and no authored report is overwritten.

The --no-session child flag avoids duplicate regular Pi session files; local run traces remain. The coordinating reviewer is explicitly routed to `openai-codex/gpt-6-astra` with `xhigh` thinking; nested leaf retrieval reviewers are routed to `openai-codex/gpt-6-sol` with `medium` thinking. ownUsage in results counts only that process's assistant-message usage, not descendants; main Pi footer accounting does not currently aggregate child model costs. Inspect each nested run for accounting. Do not treat a setup report as literature evidence.

PDF visual inspection remains constrained by the `pdf-read` skill to small, targeted, one-image-at-a-time reads. Historically, base64 page images exhausted an earlier 10 MiB ceiling. The timeout that motivated the current preservation/deadline changes instead hit 900 seconds at roughly 19.3 MB: it did not reach the current 64 MiB ceiling.

## Verification

Run `node --test test-*.mjs` from this directory (Node built-ins only). The offline tests cover explicit Astra/xhigh and Sol/medium routing and CLI arguments (including leaf delegation exclusion), missing/invalid progress timing, timing delivery, and progress-callback exceptions during streaming and final-buffer processing, and retain the original seven cases and add authored-report preservation on every termination mode, causal-error precedence, absolute deadlines, malformed/truncated events, UTF-8 splitting, reserved-file collisions, missing/malformed/escaping artifact declarations, nested budget planning, ephemeral context notices, cutoff guards, and POSIX descendant cleanup. Temporary subprocesses are deterministic Node fixtures, not Pi/LLM reviews. A staged import/main-registration smoke check also used installed Jiti/Pi dependencies without dispatch. Dispatch-policy regression tests also exercise the actual launcher guard/counter snippets: sequential main follow-ups beyond four, one active main reviewer, four concurrent children, and the non-replenishing four-child budget. These are offline implementation checks, not live evidence that a reviewer now finishes on time.

A real nested Pi smoke test used the selected openai-codex/gpt-6-astra model. Event logs confirmed one literature_review tool call in depth 1, zero tool calls in depth 2, and completed reports. Leaf reported the then-three assigned skills and absence of the delegation tool. Extraction and rendering were subsequently consolidated into pdf-read; that migration has offline launcher and helper tests, not a repeated live nested-model test. Test involved model calls, no literature searches or Zotero operations. Pre-existing stale model-pattern warnings remained unchanged.

Not tested: full literature survey, real Consensus/ResearchFastTrack queries from children, Cursor/Antigravity child inference, multiple concurrent children, active-cancellation of a live nested model tree, crash recovery, or adversarial sandboxing. The code's configured limits are not a claim that all concurrency/failure paths have been exercised.

## Maintenance

Progress display tolerates older loaded runners that omit timing metadata, using a finite dispatch deadline as a fallback or explicitly displaying no wall-clock deadline. The current offline suite also covers independent leaf budgets, unbounded-root completion/cancellation, leaf-timeout isolation, heartbeat/checkpoint persistence, concurrent child status tracking, and self-reported progress labels. No live model/MCP review was launched for this change. Synchronous progress-callback exceptions stop the subprocess and save a failed handoff instead of escaping a stream listener and crashing Pi. After changing these modules, restart Pi to ensure no older module remains loaded.

Implementation: index.ts (tool/MCP/profile integration), progress.mjs (backward-compatible progress display), runner.mjs (arguments, subprocess/output/timeout handling), runtime.mjs (budget notices/guards and artifact validation), literature-reviewer.md (methodology), test-*.mjs (offline tests). Based on the subprocess architecture described by Pi's bundled subagent example, with an independently implemented dedicated runner and no copied TUI components.

Do not install a second generic subagent extension just to use this role. To remove, disable/remove only ~/.pi/agent/extensions/literature-reviewer and reload; preserve runs and all existing skills/provider/MCP configuration. No global instruction files were modified.
