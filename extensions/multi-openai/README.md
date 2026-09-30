# Multi-OpenAI extension for Pi

Multi-account ChatGPT OAuth integration for Pi, registering secondary and tertiary
account slots (`openai-2`, `openai-3`, etc.) alongside the native `openai` provider.

Designed specifically for OpenAI's direct ChatGPT OAuth flow (`chatgpt.tokens.use.direct`
on `https://api.openai.com/v1`), replacing the legacy `@henryqw/pi-multi-codex` extension
which targeted deprecated backend endpoints.

## Features

- **Native OAuth Integration**: Uses Pi's native OAuth flow and credential store (`auth.json`),
  supporting token refresh and direct browser sign-in via `/login openai-2`.
- **Zero Extra Configuration**: Slot 2 (`openai-2`) is pre-registered on startup, making
  `/login openai-2` immediately accessible without manual setup. Higher slots (`openai-3`,
  etc.) are dynamically discovered and registered from `auth.json`.
- **Private/Incognito Browser Notification**: When authenticating secondary slots, prompts
  the user to open the OAuth URL in a Private/Incognito window or switch accounts in ChatGPT,
  preventing accidental re-authentication of Account #1.
- **Provider Rewriting & Turn Consistency**: Satisfies Pi's internal `isChatGPTSignIn`
  check by rewriting model and transcript context to `"openai"` on outgoing requests
  (stripping unsupported API parameters), and maps stream events and messages back to the
  slot provider (`openai-2`) to keep multi-turn context consistent.
- **Duplicate Account Detection**: Compares token `sub` (user account ID) claims across
  slots on startup and in `/openai-status`, warning if two slots are logged into the same account.
- **Status Bar Integration**: Displays the active account slot and authenticated email in
  the Pi status bar footer.
- **Automatic 429 Failover**: When an active slot encounters rate limits (HTTP 429),
  automatically switches the active model to the next available authenticated slot.
- **Zero Runtime Dependencies**: Fully self-contained TypeScript; executes seamlessly under
  Pi's runtime and runs offline tests via Node's native type stripping.

## Usage inside Pi

### 1. Authenticate Secondary Account

Sign into your primary account (if not already authenticated):
```text
/login openai
```

Sign into your second account:
```text
/login openai-2
```
*Note: Be sure to open the login link in a Private/Incognito window or switch to your
second account in the browser.*

### 2. View Account Status

```text
/openai-status
```
Displays all configured slots, active model marker, user emails, expiration times,
and alerts if duplicate accounts are detected.

### 3. Switch Accounts

```text
/openai-switch
```
Toggles between authenticated accounts (or opens a selection menu if more than two
slots are configured).

### 4. Add Additional Accounts (Slots 3, 4, etc.)

```text
/openai-add
```
Registers the next available slot (e.g. `openai-3`), allowing you to immediately run
`/login openai-3`.

### 5. Remove or Unenroll Accounts / Slots

```text
/openai-remove <slot-number>
```
For example, `/openai-remove 3` unenrolls slot 3 and purges its stored credentials from `auth.json`. Running `/openai-remove 2` logs out slot 2 and wipes its stored credentials. (You can also run Pi's built-in `/logout` command and choose the slot from the provider list).

## Model Compatibility Note

ChatGPT subscription OAuth tokens have direct access to OpenAI's flagship models
(e.g., `gpt-6.1-sol`, `gpt-6-astra`, `gpt-5.6-*`, `gpt-5.5`). Note that OpenAI restricts
certain low-tier API models (such as `gpt-4o-mini`) from direct ChatGPT subscription
OAuth usage.

## Offline Tests

Run tests using Node 22.18+ / 26+ native TypeScript support:

```bash
cd extensions/multi-openai && node --test test-multi-openai.mjs
```

Or run the full test suite from the repository root:

```bash
./tests/run-tests.sh
```
