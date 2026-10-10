# Research runtime

This local package isolates the standalone `billion-context-pi` extension from
Pi's shared npm tree. The Todo integration has been removed; persistent task
planning is provided by the separately declared `pi-goal-x` package in
`config/settings.json`.

After installing this setup on a new machine, install this package's local
runtime dependency from the installed agent home (works for copy and link
installs):

```bash
npm ci --prefix "${PI_CODING_AGENT_DIR:-${PI_AGENT_HOME:-$HOME/.pi/agent}}/packages/research-runtime" --ignore-scripts --omit=optional --legacy-peer-deps
```

For `--dest`, substitute that destination's `packages/research-runtime` path.
Pi supplies SDK/TypeBox peers. Optional image dependencies are omitted; images
are not validated.

`context.ts` loads the in-process context extension with `delegate: false` and
`autoUpdate: false`, also setting `ACP_AUTO_UPDATE=0`. No proxy, fetch
interception, certificate MITM, credential change or provider/model change is
used. `pi-subagents` remains the delegation mechanism. Project markdown remains
authoritative for scientific scope, decisions, evidence and authorization; task
tracking and compressed context are navigation only.

Fully restart Pi after installation or changing this extension. `/reload` alone
cannot clear old process markers. `/acp` reports in-process context state. The
extension cancels Pi native compaction while active; disable it and restart to
use native compaction. Compression remains model-driven, not guaranteed
summarization. Child compatibility, live-provider behavior, summary fidelity,
images and performance are not validated by the bounded offline fixture.

Run `node test-context.mjs` for the local offline fixture. It uses a mocked
ExtensionAPI/context and no live-provider/model calls.
