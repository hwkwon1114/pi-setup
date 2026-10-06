# Research runtime

Pinned packages: rpiv-todo 2.12.0 and billion-context-pi 0.1.83. Local dependencies avoid changing Pi's shared npm tree. Only one context manager is loaded; the former billion-context native proxy is no longer activated.

From this package directory on a new machine:
```bash
npm ci --ignore-scripts --omit=optional --legacy-peer-deps
```
Pi supplies SDK/TypeBox peers. Optional image dependencies are omitted; images are not validated.

todo.ts changes only prompt guidance: coarse milestones, qualified completion, markdown authority and restoration. Upstream todo state/UI/replay remain intact.
context.ts loads the standalone in-process context extension with `delegate: false` and `autoUpdate: false`, also setting `ACP_AUTO_UPDATE=0`. No proxy, fetch interception, certificate MITM, credential change or provider/model change is needed. `pi-subagents` remains the only delegation mechanism. No `/acp-subagents` settings writes have been performed; child compatibility is not yet validated. User/project `acp.json` can override adapter defaults; do not enable ACP delegation there.

**Fully restart Pi after replacing the proxy integration.** `/reload` alone is unsuitable because the old process can retain proxy environment markers and fetch patches, causing standalone ACP to stand down. `/todos` shows tasks; `/acp` shows in-process context state. Compression remains model-driven, not guaranteed automatic summarization. The installed standalone version cancels `session_before_compact` while active, including manual compaction; the old proxy's ownership-gated native fallback/manual behavior does not apply. Disable the extension and restart to use Pi's native compaction.

Use research-workflow's research-control guide for methods. These tools do not authorize reviewers, release tests, reset budgets or establish scientific validity.

## Legacy cleanup (2026-10-05)

No SoL-Pi package directory, shared npm dependency, active configuration entry,
or tracked executable-source reference was found in the inspected local setup.
Removed stale snapshot guidance; preserved historical test reports and the
ignore rule preventing accidental reintroduction of an old snapshot. No package
uninstall or file deletion was needed. Standalone ACP/todo and pi-subagents are
unchanged. This disk inspection does not prove old code is absent from an
already-running process; fully restart Pi after the earlier extension removals.

## Verification and limits

Run `node test-context.mjs` from a fresh shell. Bounded offline fixture: 12 synthetic messages plus one compression tool call/result, no real model requests or child agents. Checks real Pi SessionManager with captured extension hooks: five context tools registered, no ACP delegate tools after session start, updates disabled, global fetch unchanged, status succeeds, compressed summary reaches projected context after the tool result is persisted, and full inline retrieval returns original sentinel/text. Fixture artifacts are retained under the temporary directory printed by the test. This uses mocked ExtensionAPI/context, not a full live-provider SDK session.

Verified locally against Pi 1.0.2. Latest passing fixture artifacts: `/data/pxl1051/.tmp/standalone-acp-fixture-E5BoCR`. The setup's `bash tests/run-tests.sh` passed 38 checks (0 failed); `git diff --check` passed. Existing unrelated user edits were preserved. Initial fixture failures were setup/harness issues (inherited native-proxy marker, require-only resolution of an import-only SDK, and omission of Pi's persisted tool-result anchor); corrected before the final passing run. Live-session `/acp` and actual model-driven compression require a restart and remain pending. Images, OAuth provider behavior, persisted-session resume/fork inheritance, subagent tool allowlists and summary fidelity are unvalidated. No performance improvement claim.

Historical proxy fixture: credential-free native SDK task fixture (three faux responses), update/MITM opt-outs, proxy health and dummy-auth loopback request with injected compression tools passed. However the live proxy returned `unknown plugin conversation`; its log reported no model requests for the session. That established a routing/attribution failure, not the specific transport cause. The standalone integration avoids dependence on that routing seam.
