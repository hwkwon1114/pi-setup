# Multi-account Codex login and quota routing

Uses Pi's native Codex OAuth login/refresh with account slots `openai-codex`,
`openai-codex-2`, `openai-codex-3`, etc. Direct OpenAI tokens are not migrated,
reused or removed. Fully restart Pi after changing this adapter.

- `/codex-add` prepares an unsigned secondary slot; `/login openai-codex-2`
  signs in separately (use a private browser window for each account).
- `/codex-status` shows authentication; `/codex-switch` manually selects an account.
- `/codex-auto-status [refresh]` shows quota eligibility; `refresh` bypasses cache.

## Automatic subagent selection

`codex-auto/gpt-6.1-sol`, `codex-auto/gpt-6-astra` and `codex-auto/gpt-6-luna`
are native Pi virtual models. They select a **physical model with exactly the
same model ID and thinking level** on a signed-in Codex account from slots 1–3.
Pi records the actual dispatched account/model in each assistant message.

Before a new turn (including a new child's first prompt), the router polls
`https://chatgpt.com/backend-api/wham/usage` using native resolved OAuth auth.
It selects the account with the highest conservative remaining percentage:
the minimum across primary, secondary and **all** additional reported limits.
Ties prefer the lowest slot. An account needs **more than 5%** remaining.
Identical ChatGPT account IDs in multiple slots count only once.

Usage is cached for 60 seconds per extension instance. There is no idle polling;
requests are coalesced within an instance and each HTTP request times out after
10 seconds. Separate children/processes do not share reservations, so concurrent
jobs can choose the same account. This is best-effort selection, not a quota
reservation, exact capacity estimate or guarantee of model-specific entitlement.
Unknown/malformed usage, missing auth, stale reset windows and HTTP failures are
ineligible. If no account is eligible, routing fails closed with a diagnostic.
The 5% reserve and 60-second cache are constants in `router.mjs`.

Tool continuations and retries remain pinned to their original account; the pin
survives compaction through Pi's branch router state. A provider/quota failure is
returned, **not** silently retried on another account. No jobs, tool calls or
partial outputs are replayed by this extension. A later explicit prompt/resume
can select an account again. No fallback from Astra to Sol is implemented.

Portable and local settings enable this for workers/scouts/researchers/oracles,
reviewers and `astra-code-reviewer`; the default for other unpinned Pi agents is
Auto Sol. Child-only loading is configured with
`subagents.defaultSubagentOnlyExtensions`, preserving ambient extensions.
For a nonstandard agent directory, adjust that configured path. Explicit agent
extension lists/default overrides can suppress it; missing routers must not be
replaced with shell/CLI launches. Project model overrides or explicit per-run
physical models bypass automatic selection. External CLI agents and the separate
`literature_review` runner are unchanged. The main session remains on its
manually selected physical account unless you select an Auto model with `/model`.

The explicit `/review-change` owner also loads this adapter so its virtual
catalog is available before child model resolution. Review admission/ceilings
and project approval rules are unchanged; completion is not execution approval.
Fast/priority mode is not supported with these virtual models.

## Verification (2026-10-04)

Offline tests cover parser/refusal behavior, reserves, ties, duplicate identities,
cache/forced refresh, sanitized errors, exact model/thinking preservation,
pinned continuations/retries/compaction and cancellation. The real installed
Pi SDK + pi-subagents child-factory fixture initializes two children and resolves
Astra/Sol to slot 2 with six mocked quota GETs: **no prompts, live model calls,
real credentials or network**. Plain Node uses the package's own peer-alias
resolver; no dependencies are installed.

A bounded live check queried only the three official usage endpoints: conservative
remaining was slot 1 **98%**, slot 2 **77%**, slot 3 **96%**; selection was slot 1.
Credential bytes were unchanged and model calls were zero. These are point-in-time
observations, not promises of present quota or Astra entitlement. Live subagent
model execution after a full restart remains unverified.

Offline checks: `node --test extensions/multi-codex/test*.mjs` from the setup root.
The full `./tests/run-tests.sh` suite passed all **41 checks**; `git diff --check`
was clean. Portable and personal settings have matching Auto role assignments.
No package installations, commits, account migrations or credential rewrites were made.
