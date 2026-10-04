# Research runtime

Pinned upstream packages: rpiv-todo 2.12.0 and billion-context 0.1.182. Local dependencies avoid changing Pi's shared npm tree. No standalone billion-context-pi or extra delegation surface is installed.

From this package directory on a new machine:
```bash
npm ci --ignore-scripts --omit=optional --legacy-peer-deps
```
Pi supplies SDK/TypeBox peers. Optional sharp is omitted; image handling was not validated.

todo.ts changes only prompt guidance: coarse milestones, qualified completion, markdown authority and restoration. Upstream todo state/UI/replay remain intact.
context.ts disables both ordinary and forced/advisory updates, restart-on-update, release-note polling and certificate MITM before loading the native proxy plugin. Keep native compaction enabled as fallback; upstream cancels threshold/overflow only when it owns the routed conversation. Manual /compact stays user-owned. Credentials and provider/model selection are unchanged.

Restart Pi to load the runtime. /todos shows tasks; /acp shows proxy context state. SoL-Pi is not loaded in normal runtime; Action Fusion and its other mechanisms are off.

Use research-workflow's research-control guide for methods. These tools do not authorize reviewers, release tests, reset budgets or establish scientific validity.

Evidence: credential-free native SDK fixture created/listed a task (three faux responses), verified update/MITM opt-outs, local proxy health and a dummy-auth loopback HTTP request with injected compression tools. Not tested: real OAuth endpoints, summary fidelity, compress/decompress roundtrip, images, WebSocket transport, child routing or model-decision quality. No performance improvement claim.
