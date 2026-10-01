# Multi-account Codex login

Uses Pi's native `openai-codex` provider and OAuth login/refresh, with aliases
`openai-codex-2`, `openai-codex-3`, etc. Existing OpenAI credentials and commands
remain intact; direct Responses API tokens are not migrated or reused.

After `/reload`:

1. `/codex-add` prepares the first unsigned secondary slot.
2. `/login openai-codex-2` signs into that slot (use a private browser window).
3. `/model` selects a model on the Codex provider/slot.
4. `/codex-status` lists authentication state; `/codex-switch` selects an account.

The usage-limits extension discovers stored Codex slot credentials for polling.
No automatic account failover or credential removal is implemented here.
Codex stability relative to direct subscription sharing has not been assessed.

Offline checks: `node --test /home/pxl1051/.pi/agent/extensions/multi-codex/test.mjs`.
