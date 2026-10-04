# Explicit code review

This extension owns reviewer-launch authorization, not testing methodology or scientific approval. It adds no AGENTS paragraph and no mandatory validator. Action Fusion is not loaded in normal runtime; optional tests can still cover an external SoL-Pi checkout.

## Commands

```text
/review-change Review <source paths> against <requirements>; return findings and unperformed checks
/review-change --safety Review <code/config/data/design identities> under <objective/investigation/protocol paths> before execution
/review-cancel
```

A command launches **one fresh-context foreground leaf** through pi-subagents' structured delegation API. Ordinary review selects the configured `reviewer`; `--safety` selects the existing `astra-code-reviewer` profile. Model/provider overrides remain authoritative. There is no model-callable authorization tool, automatic post-edit review, command-level re-dispatch/retry, command-owned account selection, or automatic main-model continuation. The owner loads the multi-Codex virtual catalog; configured `codex-auto/gpt-6-astra` reviewers select an account by quota at model dispatch without changing the physical Astra model. Continuations/retries remain pinned; see the [routing contract](../multi-codex/README.md). Natural-language requests do not mint runtime permission: invoke the command explicitly.

Each command requests a 10-minute cooperative deadline and 64 executed tool calls (`block: "*"`). These are not OS-level kills or a token/cost quota. Cancellation targets the exact request/owner/node tuple; package shutdown runs before disposal. Findings, task, request, usage and terminal receipt are saved privately under `~/.pi/agent/review-change-runs/review-*/`. A completed child is not an approval verdict. Parent acceptance and any existing scientific execution gates remain separate.

Required pre-execution safety reviews are **not waived**. Use `--safety` and resolve launch blockers before expensive execution. This extension does not enforce training/cluster execution, assess review freshness, grant experimental scope, or release sealed tests. It changes reviewer dispatch to command-only; a training request alone does not unlock a reviewer launch.

## Boundary

The main session's package-owned capability ceiling always excludes named code-review roles. A command creates a separate in-memory owner with its own bus and a ceiling allowing only the selected reviewer and review tools; it **never opens the main ceiling**. Another active capability policy blocks the command rather than being bypassed. No main conversation is copied; the reviewer receives the explicit task and its normal role/project/global context.

Covered identities: `reviewer`, `astra-code-reviewer`, `evidence-auditor`, and names/aliases with a `code-reviewer`/`code_reviewer` identity. Package-local identities are considered. This is not semantic detection of every review task: asking a worker/oracle/external CLI to review under another identity is outside this gate. Literature roles are not classified as code reviewers; `literature_review` and its isolated process path are unchanged.

Core admission covers direct tools, aliases, workflow children, RPC/structured delegation, nested and detached routes through the package's monotonic ceilings. Tests exercise direct, alias, foreground opaque-workflow, nested Codemode-to-RPC and main structured-RPC routes. The installed `subagent` tool is model-only, so direct Codemode access is additionally unavailable. Detached launch/recovery and durable schedules are not integration-tested here. Already-admitted pre-gate work is not retroactively stopped.

**Limitations:**

- Not an OS sandbox: arbitrary shell/Pi subprocesses, malicious trusted extensions, configuration edits, and differently named agents can bypass this identity-based policy.
- pi-subagents currently rejects creating schedules under a ceiling and applies active policy when existing schedules fire. Scheduled delegation is therefore restricted, including non-review schedules. The command also refuses a project schedule directory or configured custom schedule root unless scheduling is already disabled: its temporary host must not launch unrelated due jobs. It never changes scheduling settings. No schedule directories were found in the checked project, pi-setup or agent-home scope; other projects/custom schedule roots were not scanned.
- Catalog discovery still uses an internal seam. There is **no package-version pin**: startup checks required functions/events and probes ceiling intersection, empty-deny, session isolation, disposal and inherited snapshot behavior without I/O or provider calls. Newer compatible versions are accepted; a missing/broken API closes package launches when a usable ceiling API remains and blocks model dispatch visibly. The probe is not proof of every execution path—run the offline integration checks after upgrades. A completely missing/incompatible ceiling API cannot provide package-level enforcement.
- Normal user/project agent catalogs are refreshed at session start and parent-turn/tool boundaries. Agents introduced only inside another workflow cwd/runtime may fail closed until exposed in the parent catalog. Foreground worker delegation was verified; arbitrary custom workflows are not certified.
- Commands require an available configured provider; no live authentication, subscription/quota behavior, model quality or real review was tested. Provider inheritance uses the same public projection as pi-subagents. The command does not add failover or resubmit a delegation. Its in-memory owner disables retry/cache warming; package-owned children read their existing native settings, so child retries/cache warming and provider-internal policies are not globally overridden.
- The owner loads only pi-subagents. Foreground reviewer tools/extensions remain package/role-owned, not a clone of every ambient main-session extension. The main usage extension is display-only; main-session context ownership follows the in-process ACP runtime documented in the root README; reviewer child ACP loading is not assumed. Literature routing is unchanged.

## Latest-first maintenance

Personal and portable settings use `npm:pi-subagents@latest`. Keep that source, update only this package, and adapt the gate instead of pinning/downgrading upstream to satisfy it:

```bash
pi update npm:pi-subagents@latest --no-approve
```

Then run the checks below and `/reload`. No background updater or live reviewer test is added. Current installed/tested release: **0.75.0** on Pi 1.0.0. If a future release cannot support the policy, retain the failure evidence and make a narrowly maintained adapter/fork rather than silently disabling authorization. No fork is currently needed or published.

## Offline checks

```bash
node --test extensions/review-gate/test-policy.mjs extensions/review-gate/test-compatibility.mjs extensions/review-gate/test-integration.mjs
./tests/run-tests.sh
```

The integration fixture uses only faux providers and a temporary agent home (no real credentials or live requests). It retains its small fixture/receipts and reports the path. It skips if Pi or pi-subagents is unavailable; set `PI_REVIEW_GATE_PI_DIR` if executable discovery cannot locate the installed SDK. `PI_REVIEW_GATE_SOL_DIR` optionally selects an existing SoL-Pi checkout to check fused and unfused writes together. No dependency installation is attempted.

`review.md` records actual checks, failures and limits. Reload Pi to load the extension; normal-session activation has not been observed.
