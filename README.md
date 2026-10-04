# pi setup (portable)

Reproducible copy of the pi agent home (`~/.pi/agent`): shared working preferences,
skills, extensions (literature reviewer, multi-account OpenAI/Codex and usage display),
and provider/MCP configuration.

## Install on another machine

```bash
git clone <this repo> ~/Documents/pi-setup
cd ~/Documents/pi-setup
./bin/install.sh            # copy into ~/.pi/agent (anything replaced is backed up)
./bin/install.sh --link     # or symlink skills/extensions/roles to this repo
./bin/install.sh --dry-run  # preview
```

Target defaults to `$PI_AGENT_HOME`, else `~/.pi/agent`; override with `--dest=PATH`.

## Bidirectional updates across computers (recommended)

Keep a permanent checkout on each computer. On an already configured machine:

```bash
git clone https://github.com/hwkwon1114/pi-setup.git ~/pi-setup
cd ~/pi-setup
./bin/install.sh --link --resources-only --dry-run
./bin/install.sh --link --resources-only
```

This links skills, extensions and roles to the checkout, backing up replaced
resources while leaving all local configuration and credentials untouched.
Compare existing resources before linking: reconcile any local-only changes into
the checkout first. Do not move or delete the checkout after linking.
Fresh machines should first review the configuration templates and use the full
installer above; `--resources-only` does not configure providers or MCP dependencies.
Do not also register these same resources with `pi install`: that can load them twice.

Before editing on either computer:

```bash
cd ~/pi-setup
git status                 # commit/reconcile existing work before pulling
git pull --rebase
# Edit linked resources, then run checks in an appropriate environment.
git diff
git add <specific-files>   # replace with reviewed paths; never add secrets
git commit -m "Describe the update"
git push
```

On the other computer, run `git pull --rebase`, then `/reload` in Pi. Restart Pi
if the extension changes require it. Resolve Git conflicts explicitly; do not
force-push or overwrite the other computer's changes. Review config changes
separately: linked updates intentionally do not overwrite machine settings.

If symlinks are unavailable, use `--resources-only` without `--link` to copy.
Before pulling, reconcile local resource edits into the checkout and commit them;
after pulling, rerun the copy installer. Never reinstall over unexported edits.

### Exporting an existing setup

```bash
./bin/export.sh --dry-run
./bin/export.sh             # ~/.pi/agent -> this repo, then review git diff
```

Export replaces resource directories and copies configuration; it is not a merge
or a secret scrubber. Avoid it for routine linked updates. Review configuration
for credentials, local paths and computer-specific preferences before committing.
Keep authentication, session data and research files out of this repository.
Cluster helpers (such as Quest's `srun-here`), scheduler defaults and cluster-specific
instructions belong on that machine, not in shared configuration.

## Contents

| Path | What |
| --- | --- |
| `config/AGENTS.md` | Global working preferences (training, figures, literature routing) |
| `config/settings.json` | Theme, default model/provider, `packages`, `enabledModels` |
| `config/models.json` | Output caps for OpenAI and Antigravity; context windows come from the model catalog |
| `config/mcp.json` | Native MCP servers: `consensus`, `researchfasttrack` (codemode exposure; Consensus OAuth) |
| `skills/` | Research, analysis, visualization, editable diagrams and maintenance skills |
| `agents/` | Astra code reviewer and literature-reviewer bridge definitions |
| `extensions/literature-reviewer/` | `literature_review` delegation tool (Approach B: hybrid subagent integration & FleetView) |
| [`extensions/multi-openai/`](extensions/multi-openai/README.md) | Multi-account ChatGPT OAuth integration (`openai-2`, etc.), status footer, switch & 429 failover |
| [`extensions/multi-codex/`](extensions/multi-codex/README.md) | Separate native Codex OAuth slots: `/codex-add`, `/codex-status`, `/codex-switch` |
| `extensions/usage-limits.ts` | `/usage`, response-header limits and active Codex usage; display only, native compaction |
| [`extensions/review-gate/`](extensions/review-gate/README.md) | Explicit `/review-change` authorization; latest-first API compatibility checks, scheduling restrictions documented |
| `roles/literature-reviewer/` | Role skills (`research-ideas`) used by that extension |
| `optional/mineru/` | Installer + pinned lockfile for the optional MinerU equation backend |
| `bin/common.sh` | Cross-platform helpers: agent home, OS, python, venv layout, symlink test |
| `bin/subagent-history.py` | CLI audit tool (`subagent-history`) tracking runs, token costs, and unused subagents |

## Multiple OpenAI / ChatGPT accounts (same session)

The repository provides the `multi-openai` extension (`extensions/multi-openai`),
enabling multiple accounts using OpenAI's direct ChatGPT OAuth flow (`chatgpt.tokens.use.direct`
on `https://api.openai.com/v1`). It is loaded automatically when extensions are linked.

Inside Pi:

1. `/login openai`: authenticate Account #1 (primary `openai` provider).
2. `/login openai-2`: authenticate Account #2. Open the OAuth link in a
   Private/Incognito window or switch accounts in ChatGPT.
3. `/openai-status`: view authenticated account emails, active slot, and token expiration.
4. `/openai-switch`: switch the current model between authenticated accounts.
5. `/openai-add`: enroll additional numbered slots (`openai-3`, `openai-4`, etc.).
6. `/openai-remove <slot>`: remove credentials for a slot or unenroll an added slot (e.g. `/openai-remove 3`). Alternatively, use Pi's built-in `/logout` command.

If model scope is restricted (`enabledModels` or a scoped session), allow the
numbered provider's exact model aliases as well, such as
`openai-2/gpt-6.1-sol` and `openai-2/gpt-6-astra`.

The extension performs automatic HTTP 429 failover to the next available authenticated
slot upon rate limiting. Credentials stay in local `auth.json` on each machine.

## Usage display and compaction

`/usage` shows captured limits and cached subscription observations. Codex usage
is fetched only for the active Codex account, on interactive session/model
selection (three-minute cache) or `/usage refresh` (forced refresh). No idle polling
or background checks of other accounts. `/usage raw` shows the cached response.
Direct OpenAI subscription allowance remains unknown unless a request reports a
quota block; API rate limits are not subscription allowance.

Native compaction remains enabled as fallback. With the research runtime installed, billion-context owns routed conversations and cancels automatic threshold/overflow compaction only when it owns that conversation. Manual `/compact` remains user-owned. Without the proxy, Pi's native model-aware controller applies. The threshold/lifecycle details below describe that native fallback, not the proxy compression strategy.
It triggers above `model.contextWindow - compaction.reserveTokens` (default
reserve: 16,384 tokens), using the selected model's catalog metadata instead of
local fixed context caps. Output caps in `config/models.json` remain unchanged.
Switching models changes the next threshold; exact provider/model reserve
overrides and project settings are honored.

Pi 1.0.0 checks after a tool batch finishes, before the next assistant response,
and before a new user prompt. It pauses to summarize and continues the existing
run without this extension calling manual compaction, aborting it, or injecting
a hidden replacement turn. The usage extension only displays context and quota
observations. Compaction still takes time and can fail or be cancelled; provider
overflow recovery is a separate native path. Catalog metadata must describe the
real endpoint limits; this is not a guarantee against oversized tool results
or perfect summary retention.

Offline regression evidence and limitations: [dynamic compaction handoff](tests/usage-compaction/review.md).
Run `/reload` after applying the resource changes; use `/model` and reselect
the current model to load refreshed metadata (or restart Pi). Already-running
sessions may retain the old controller/model until then.

## Todo and long-context research runtime

`packages/research-runtime` isolates pinned rpiv-todo 2.12.0 and billion-context
0.1.182 dependencies from Pi's shared npm tree. After installing this setup, run
in the **installed agent-home package**, so both copy and link installs work:

```bash
npm ci --prefix "${PI_CODING_AGENT_DIR:-${PI_AGENT_HOME:-$HOME/.pi/agent}}/packages/research-runtime" --ignore-scripts --omit=optional --legacy-peer-deps
```

For `--dest`, replace the prefix with that destination's `packages/research-runtime`.

Restart Pi; `/todos` displays milestones and `/acp` reports proxy context.
The local adapters use coarse tasks and disable background ordinary/advisory
updates, release polling, auto-restart and certificate MITM. No alternate delegate
or standalone billion-context-pi is installed. Credentials and reviewer routing
remain unchanged. Method guidance stays in research-workflow; project markdown,
not task status or compressed summaries, is authoritative.

SoL-Pi, including Action Fusion, is no longer loaded in normal runtime.
A local `packages/sol-pi` snapshot may be retained for history; it is excluded
from publication. All SoL-Pi features are off.
See [runtime scope and limits](packages/research-runtime/README.md).
Native SDK/loopback fixtures are not proof of real OAuth, WebSocket, image,
child-routing, compression fidelity or scientific-performance compatibility.

## Deliberately not packaged

Credentials and machine state stay on each machine:
`auth.json`, `models-store.json`, `mcp-cache.json`, `trust.json`, `sessions/`,
`literature-review-runs/`, `review-change-runs/`, `npm/node_modules/`, `bin/` (platform binaries),
`backups/`, `extension-backups/`, `skill-maintenance/` working dirs.

## Self-check

```bash
./tests/run-tests.sh     # offline: no network, no credentials, temp dirs only
```

Covers script syntax, CRLF, config JSON, skill frontmatter and cross-references, the
extensions' unit tests (including multi-Codex and usage-display fixtures), install/export
round trip (including paths with spaces and idempotent reruns), and MinerU dry-runs
for both `bin/` and Windows `Scripts/` layouts. TypeScript fixtures require Node
native TypeScript support (Node 22.18+).
Checks needing an absent tool (`python3`, `uv`, `node`) are skipped or invert to an
error-message assertion, so the suite is green on a bare machine too.

## Post-install checklist

1. **Sign in to providers first.** Model catalogs are fetched per provider after
   authentication and are not packaged, so until you log in pi prints
   `Warning: No models match pattern "..."` for every entry in `enabledModels`.
   This is expected, not a broken config; the warnings clear once signed in.
   `pi update --models` alone does **not** populate the catalogs.
2. First launch installs the npm packages from `settings.json`; verify with `/packages`.
3. MCP servers need their own OAuth on first use.
4. Prune `enabledModels` for providers you do not have on the new machine.
5. Optional: reinstall `rg`/`fd` into `~/.pi/agent/bin` if you rely on the bundled copies.

## Optional local MinerU backend

`pdf-read` can use a local MinerU pipeline for candidate LaTeX on equation-heavy
pages. It is optional and never bundled: Poppler does all default text extraction
and rendering, and the packaged scripts never invoke MinerU.

To install it on a new machine (~2.2 GB, rebuilt from a pinned lockfile):

```bash
export MINERU_HOME="$HOME/pi-tools/mineru"
./optional/mineru/install.sh --dry-run
./optional/mineru/install.sh
```

See `optional/mineru/README.md` for prerequisites, verification and platform caveats.
If you already have an install elsewhere, just export `MINERU_HOME` at its root
(expects `mineru-venv/`, `mineru-cache/`, `mineru.json`). Default fallback is
`~/tmp/pdf-equation-benchmark`. With no installation the skill reports the backend
unavailable and stays on Poppler. Its accuracy evidence is a two-page pilot only, so
treat any output as an unverified candidate transcription.
