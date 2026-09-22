# pi setup (portable)

Reproducible copy of the pi agent home (`~/.pi/agent`): shared working preferences,
skills, extensions (literature reviewer and opt-in Codex Fast), and provider/MCP configuration.

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
| `config/models.json` | Custom model definitions (`openai-codex/gpt-reserve`) |
| `config/mcp.json` | MCP servers: `consensus`, `researchfasttrack` (lazy, OAuth) |
| `skills/` | exploratory-data-analysis, paper-summary, pdf-read, research-workflow, scientific-visualization, skill-maintenance, statistical-analysis, zotero-sync |
| `extensions/literature-reviewer/` | `literature_review` delegation tool |
| [`extensions/codex-fast/`](extensions/codex-fast/README.md) | `/fast on\|off\|status`: Codex priority tier, default off; model/thinking unchanged |
| `roles/literature-reviewer/` | Role skills (`research-ideas`) used by that extension |
| `optional/mineru/` | Installer + pinned lockfile for the optional MinerU equation backend |
| `bin/common.sh` | Cross-platform helpers: agent home, OS, python, venv layout, symlink test |

## Manual Codex accounts

Use `bin/pi-account` from your terminal (not a Pi slash command):

```bash
~/pi-setup/bin/pi-account create second
~/pi-setup/bin/pi-account use second
# Inside that Pi instance: /login, then select Codex and sign in with account two.
~/pi-setup/bin/pi-account use default
~/pi-setup/bin/pi-account list
```

Your existing `~/.pi/agent` login is the `default` profile and is never copied or
replaced. Named profiles live outside this repository in `~/.pi/codex-accounts/`,
created with private permissions. Each has separate credentials, sessions,
settings and model catalogs. Run the appropriate `use` command to switch;
there is no in-session `/account`, automatic balancing or quota failover yet.
Use only accounts you are authorized to access under the provider's policies.

New profiles are deliberately bare: global extensions (including `/fast`),
skills and settings are not copied. Project settings/resources and ambient
provider environment variables can still apply. This is credential-directory
separation, not a security sandbox. No sessions are migrated automatically;
explicit Pi session arguments remain your responsibility. To continue a profile's
own latest session, append `-c`. `PI_ACCOUNT_ROOT` and
`PI_ACCOUNT_DEFAULT_DIR` override the two locations if needed.

Offline wrapper check: `bash tests/test-accounts.sh` (Linux; fake Pi, no network).

## Deliberately not packaged

Credentials and machine state stay on each machine:
`auth.json`, `models-store.json`, `mcp-cache.json`, `trust.json`, `sessions/`,
`literature-review-runs/`, `npm/node_modules/`, `bin/` (platform binaries),
`backups/`, `extension-backups/`, `skill-maintenance/` working dirs.

## Self-check

```bash
./tests/run-tests.sh     # offline: no network, no credentials, temp dirs only
```

Covers script syntax, CRLF, config JSON, skill frontmatter and cross-references, the
extensions' unit tests (Codex Fast tests require Node native TypeScript support), install/export round trip (including paths with spaces and
idempotent reruns), and MinerU dry-runs for both `bin/` and Windows `Scripts/` layouts.
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
