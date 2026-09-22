# Codex Fast toggle

Local Pi extension requesting OpenAI's priority service tier without changing
model, thinking level, prompts or tools. No dependencies to install.

After installing/linking this setup, enter these commands **inside Pi**:

```text
/reload
/fast status
/fast on
```

Use `/fast off` to stop requesting priority. Bare `/fast` reports status;
argument completion offers `on`, `off`, `status`.

- **Off by default.** Opt-in is in memory only and resets on reload, new/resumed/
  forked sessions, shutdown and model changes. Other Pi processes do not inherit it.
- The `openai-codex` provider and numbered `@henryqw/pi-multi-codex` aliases
  (`openai-codex-2`, etc.) with the `openai-codex-responses` API are supported.
  Account switches reset Fast off, including automatic failover.
  The payload model must match the explicitly enabled model. Matching subsequent
  requests receive `service_tier: "priority"` via `before_provider_request`.
- Footer text says **priority requested**, not server-confirmed. OpenAI controls
  account/model eligibility, actual tier, quota and billing; higher usage/cost
  may apply. No speed or exact price multiplier is promised.
- Off returns the original request unchanged: it does not undo tiers configured
  by another extension/provider. Later payload hooks can override this one.
- No credentials/settings edits, payload logging, network calls, persisted
  opt-ins, retries or automatic tier fallback. If OpenAI rejects priority, use
  `/fast off`. The host's existing retry policy is unchanged.

Offline tests (Node 22.18+ native TypeScript support; otherwise explicitly skipped):

```bash
node --test extensions/codex-fast/test-fast.mjs
```

Implementation follows the installed Pi extension documentation's
`before_provider_request`, command, session/model-event and `setStatus` APIs.
The Codex backend accepts `serviceTier` and serializes it as `service_tier`;
this extension adds that wire field through the documented payload hook.
Live account eligibility, delivered priority, latency and billing remain untested.
