# pi setup (portable)

Reproducible copy of the pi agent home (`~/.pi/agent`): shared working preferences,
skills, the literature-reviewer extension/role, and provider/MCP configuration.

## Install on another machine

```bash
git clone <this repo> ~/Documents/pi-setup
cd ~/Documents/pi-setup
./bin/install.sh            # copy into ~/.pi/agent (anything replaced is backed up)
./bin/install.sh --link     # or symlink skills/extensions/roles to this repo
./bin/install.sh --dry-run  # preview
```

Target defaults to `$PI_AGENT_HOME`, else `~/.pi/agent`; override with `--dest=PATH`.

## Keep the package current

```bash
./bin/export.sh             # ~/.pi/agent -> this repo, then git diff / commit
```

## Contents

| Path | What |
| --- | --- |
| `config/AGENTS.md` | Global working preferences (training, figures, literature routing) |
| `config/settings.json` | Theme, default model/provider, `packages`, `enabledModels` |
| `config/models.json` | Custom model definitions (`openai-codex/gpt-reserve`) |
| `config/mcp.json` | MCP servers: `consensus`, `researchfasttrack` (lazy, OAuth) |
| `skills/` | exploratory-data-analysis, paper-summary, pdf-read, research-workflow, scientific-visualization, skill-maintenance, statistical-analysis, zotero-sync |
| `extensions/literature-reviewer/` | `literature_review` delegation tool |
| `roles/literature-reviewer/` | Role skills (`research-ideas`) used by that extension |

## Deliberately not packaged

Credentials and machine state stay on each machine:
`auth.json`, `models-store.json`, `mcp-cache.json`, `trust.json`, `sessions/`,
`literature-review-runs/`, `npm/node_modules/`, `bin/` (platform binaries),
`backups/`, `extension-backups/`, `skill-maintenance/` working dirs.

## Post-install checklist

1. Sign in to providers in pi (`/login`); no keys are in this repo.
2. First launch installs the npm packages from `settings.json`; verify with `/packages`.
3. MCP servers need their own OAuth on first use.
4. Prune `enabledModels` for providers you do not have on the new machine.
5. Optional: reinstall `rg`/`fd` into `~/.pi/agent/bin` if you rely on the bundled copies.

## Optional local MinerU backend

`pdf-read` can use a local MinerU pipeline for candidate LaTeX on equation-heavy
pages. It is optional and never bundled: Poppler does all default text extraction
and rendering, and the packaged scripts never invoke MinerU.

If you have an installation, point the skill at it:

```bash
export MINERU_HOME=/path/to/mineru-root   # expects mineru-venv/, mineru-cache/, mineru.json
```

Default fallback is `~/tmp/pdf-equation-benchmark` (the original pilot machine,
MinerU 3.4.5). With no installation the skill reports the backend unavailable and
stays on Poppler. Its accuracy evidence is a two-page pilot only, so treat any
output as an unverified candidate transcription.
