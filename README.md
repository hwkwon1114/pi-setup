# pi setup (portable)

Reproducible copy of the pi agent home (`~/.pi/agent`): shared working preferences,
skills, extensions (literature reviewer, multi-account OpenAI/Codex and usage display),
and provider/MCP configuration.

## Install on another machine

```bash
git clone <this repo> ~/Documents/pi-setup
cd ~/Documents/pi-setup
./bin/install.sh            # copy into ~/.pi/agent (anything replaced is backed up)
./bin/install.sh --link     # link resources/instructions; compose private JSON configuration
./bin/install.sh --dry-run  # preview
```

Target defaults to `$PI_CODING_AGENT_DIR`, then `$PI_AGENT_HOME`, else `~/.pi/agent`; override with `--dest=PATH`. Python 3 is required for full configuration installation.

## Bidirectional updates across computers (recommended)

Keep a permanent checkout on each computer and link it into Pi:

```bash
git clone https://github.com/hwkwon1114/pi-setup.git ~/pi-setup
cd ~/pi-setup
./bin/install.sh --link --dry-run
./bin/install.sh --link
```

This symlinks `skills/`, `extensions/`, `roles/`, `agents/`, `packages/` and
`config/AGENTS.md`; pulls update these portable resources directly. JSON files
are **not linked**. The installer composes local `settings.json`, `models.json`
and `mcp.json` from shared `config/` defaults plus private
`<agent-home>/local-config/` overrides. See [configuration layering](docs/configuration-sharing.md).

Put shell paths, executable arguments, environment variables, proxy settings,
local endpoints and machine-only preferences in those private override files.
Nested objects merge, arrays replace, and `null` removes a default key.
Device/changelog fields stay local automatically. Live Pi/UI edits refuse the
next sync rather than disappearing: `bin/sync-settings.sh --capture-local`
explicitly records them as private overrides. To share a preference, edit the
corresponding `config/*.json` directly; JSON is never exported automatically.

Full linked installs add `post-merge`/`post-rewrite` hooks to compose configuration
after pulls/rebases, without bypassing local-edit checks. Copy installs require
manual sync/reinstallation. Credentials are never touched. Do not move/delete
the checkout or also register the same resources with `pi install`.

Day-to-day on either computer:

```bash
cd ~/pi-setup
git pull --rebase          # linked resources update; hooks compose private JSON
# edit portable config/*.json or linked resources directly; run checks
./bin/sync-settings.sh     # apply shared defaults + this machine's overrides
git diff
git add <specific-files>   # never add secrets
git commit -m "Describe the update" && git push
```

Then `/reload` in Pi (restart if extensions changed). Resolve conflicts
explicitly; do not force-push. `--resources-only` links only the directories
and leaves all configuration alone. If symlinks are unavailable, install
without `--link` (copy) and rerun the installer after each pull; reconcile
local edits into the checkout first.

### Exporting an existing setup

```bash
./bin/export.sh --dry-run
./bin/export.sh             # ~/.pi/agent -> this repo, then review git diff
```

Export replaces resource directories and copies portable instructions; it is not
a merge or a secret scrubber. It never copies settings/models/MCP JSON or
`local-config/`. Promote individual portable preferences in `config/*.json`
explicitly; review changes for credentials and machine paths before committing.
Keep authentication, session data and research files out of this repository.
Cluster helpers (such as Quest's `srun-here`), scheduler defaults and cluster-specific
instructions belong on that machine, not in shared configuration.

## Contents

| Path | What |
| --- | --- |
| `config/AGENTS.md` | Global working preferences (training, figures, literature routing) |
| `config/settings.json` | Theme, default model/provider, `packages`, `enabledModels` |
| `config/models.json` | Output caps for Codex account slots and Antigravity; context windows come from the model catalog |
| `config/mcp.json` | Native MCP servers: `consensus`, `researchfasttrack` (codemode exposure; Consensus OAuth) |
| `skills/` | Research, analysis, visualization, editable diagrams and maintenance skills |
| `agents/` | Astra code reviewer and literature-reviewer bridge definitions |
| `extensions/literature-reviewer/` | `literature_review` delegation tool (Approach B: hybrid subagent integration & FleetView) |
| [`extensions/multi-codex/`](extensions/multi-codex/README.md) | Native Codex OAuth slots, account status in footer and quota-aware virtual routing: `/codex-add`, `/codex-status`, `/codex-switch`, `/codex-auto-status` |
| `extensions/usage-limits.ts` | `/usage`, response-header limits and active Codex usage; display only, native compaction |
| `roles/literature-reviewer/` | Role skills (`research-ideas`) used by that extension |
| `optional/mineru/` | Installer + pinned lockfile for the optional MinerU equation backend |
| `bin/common.sh` | Cross-platform helpers: agent home, OS, python, venv layout, symlink test |
| `bin/subagent-history.py` | CLI audit tool (`subagent-history`) tracking runs, token costs, and unused subagents |

## Codex / ChatGPT accounts

Codex is the standard OpenAI subscription route. Both personal and portable
settings default to `openai-codex/gpt-6.1-sol`; configured agents use Codex,
with Astra for review/coordinator roles and Sol for workers/leaves. Antigravity
remains available. Pi subagents use `codex-auto/*` to select slots 1–3 by quota
before new turns, retaining exact physical model/thinking. Continuations and
retries remain pinned; no failed job is silently relaunched. The separate
literature runner remains physically pinned. See the [routing contract and
verification](extensions/multi-codex/README.md); project/per-run physical pins
bypass automatic routing.

Inside Pi:

1. `/login openai-codex` authenticates the primary account if needed.
2. `/codex-add` prepares the next secondary slot; `/login openai-codex-2`
   signs in separately (use a private browser window).
3. `/codex-status` lists account authentication; `/codex-switch` selects one.
4. `/codex-auto-status refresh` checks all three slots and shows quota eligibility.
5. `/subagents-models` confirms the reloaded Auto role assignments.

`enabledModels` includes Codex slots 1–3. Add exact model patterns for any
additional slots. Credentials are machine-local; existing direct-OpenAI tokens
are preserved, not migrated or reused as Codex credentials.

The direct-OpenAI adapter has been fully retired; Codex is the exclusive
route for ChatGPT accounts, and shared streaming/dir helpers live directly in
`extensions/multi-codex/stream.ts`. Fully restart Pi after changing provider adapters;
resuming an old session may restore its old model—select Codex with `/model`.

Codex standardization (researcher direction, 2026-10-04): offline checks cover
configuration, numbered-slot child routing (including missing-adapter refusal),
and Pi's real extension loader excluding direct-OpenAI while retaining Codex
and usage discovery. `node --test tests/test-codex-standardization.mjs
extensions/literature-reviewer/test-runner.mjs` passed 35 tests, none skipped.
The full `./tests/run-tests.sh` suite passed all 39 checks; `git diff --check`
was clean, and personal settings matched the Codex routing policy.
Credential bytes were unchanged. Live provider and ACP behavior still require
post-restart verification; there were no live model calls or account migrations.

## Usage display and compaction

`/usage` shows captured limits and cached subscription observations. Codex usage
is fetched only for the active Codex account, on interactive session/model
selection (three-minute cache) or `/usage refresh` (forced refresh). The display
has no idle polling or background checks of other accounts. Separately, Auto
routing checks all three slots on new routed turns (60-second instance-local
cache); use `/codex-auto-status` for routing eligibility, not the display cache.
`/usage raw` shows the display's cached response.
Direct OpenAI subscription allowance remains unknown unless a request reports a
quota block; API rate limits are not subscription allowance.

With the research runtime installed, standalone billion-context-pi rewrites context in-process and owns compression; version 0.1.83 cancels native compaction, including manual `/compact`, while active. Disable the context extension and fully restart Pi to use native compaction. The threshold/lifecycle details below describe Pi's native controller when ACP is not loaded, not ACP's model-driven compression strategy.
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

## Research workflow extensions and context runtime

Shared `config/settings.json` declares unpinned npm packages:
`@juicesharp/rpiv-ask-user-question` (interactive decisions), `pi-goal-x`
(persistent investigation task plans and autonomous continuation), and
`@dietrichgebert/ponytail` (the official Pi extension and its skills for lean
coding). `pi update --extensions` refreshes them to the latest published npm
versions. These declarations track published releases, not unreleased GitHub
commits.

To match this setup's preference to avoid a second completion review, disable
the optional goal auditor in `/goal-settings` on each machine. This setting is
stored locally by pi-goal-x and is not part of the shared Pi settings sync.
The Astra pre-execution review and project scientific records remain authoritative.

`packages/research-runtime` contains only the standalone `billion-context-pi`
context extension; the Todo integration has been removed. After installing this
setup, install the local dependency in the **installed agent-home package** so
copy and link installs both work:

```bash
npm ci --prefix "${PI_CODING_AGENT_DIR:-${PI_AGENT_HOME:-$HOME/.pi/agent}}/packages/research-runtime" --ignore-scripts --omit=optional --legacy-peer-deps
```

For `--dest`, substitute that destination's `packages/research-runtime` path.
Fully restart Pi after installing or changing extensions. `/acp` reports
in-process context state. The context extension cancels native compaction while
active; disable it and restart to use Pi native compaction. Its bounded offline
fixture does not validate live-provider behavior, child/fork/resume compatibility,
summary fidelity, images or performance. See
[runtime scope and limits](packages/research-runtime/README.md).

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
