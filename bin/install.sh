#!/usr/bin/env bash
# Install this pi setup into a pi agent home (default: ~/.pi/agent).
# Runs on macOS, Linux, WSL and Windows (Git Bash / MSYS2 / Cygwin, which is the
# shell pi itself uses on Windows).
#
#   ./bin/install.sh            # copy files (backs up anything replaced)
#   ./bin/install.sh --link     # link resources/instructions; compose local JSON
#                               # configuration from defaults + private overrides
#   ./bin/install.sh --dry-run  # show what would change
#
# Never touches credentials or state: auth.json, models-store.json, mcp-cache.json,
# sessions/, trust.json, literature-review-runs/ are left alone.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$REPO/bin/common.sh"
DST="$(pi_agent_home)"
OS="$(pi_os)"
MODE=copy
DRY=0
RESOURCES_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --link) MODE=link ;;
    --resources-only) RESOURCES_ONLY=1 ;;
    --dry-run) DRY=1 ;;
    --dest=*) DST="${arg#--dest=}" ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$DST/backups/install-$STAMP"

say() { printf '%s\n' "$*"; }
run() { if [ "$DRY" = 1 ]; then say "  would: $*"; else "$@"; fi; }

backup() { # $1 = path in DST
  [ -e "$1" ] || [ -L "$1" ] || return 0
  run mkdir -p "$BACKUP"
  run cp -R "$1" "$BACKUP/"
  run rm -rf "$1"
}

if [ "$MODE" = link ] && ! pi_symlinks_work; then
  cat >&2 <<EOF
error: this shell cannot create symlinks (common on Windows without Developer Mode).
       Re-run without --link to copy, or enable Developer Mode / run as Administrator
       and set MSYS=winsymlinks:nativestrict.
EOF
  exit 1
fi

say "pi setup: $REPO -> $DST  (os=$OS, mode=$MODE, dry-run=$DRY)"
run mkdir -p "$DST"

# shellcheck source=link-targets.sh
. "$REPO/bin/link-targets.sh"

link_or_copy() { # $1 = repo path, $2 = name in DST
  local src="$REPO/$1" dst="$DST/$2"
  [ -e "$src" ] || return 0
  if [ "$MODE" = link ]; then
    if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
      say "= $2 (already linked)"; return 0
    fi
    backup "$dst"
    run ln -s "$src" "$dst"
  else
    if [ -f "$src" ] && [ -f "$dst" ] && [ ! -L "$dst" ] && cmp -s "$src" "$dst"; then
      say "= $2 (unchanged)"; return 0
    fi
    backup "$dst"
    run cp -R "$src" "$dst"
  fi
  say "+ $2 ($MODE)"
}

# --- shared instructions and config files -------------------------------------
if [ "$RESOURCES_ONLY" = 0 ]; then
  PY_CMD="$(pi_python || true)"
  if [ "$DRY" = 1 ]; then
    say "  would: compose JSON defaults + local-config overrides (refuse unrecorded edits)"
  elif [ -n "$PY_CMD" ]; then
    $PY_CMD "$REPO/bin/sync-settings.py" "$REPO/config" "$DST"
  else
    say "error: Python 3 required for safe configuration composition" >&2; exit 1
  fi
  for rel in "${PI_LINK_FILES[@]}"; do link_or_copy "$rel" "${rel##*/}"; done
fi

# --- directory payloads --------------------------------------------------------
for d in "${PI_LINK_DIRS[@]}"; do link_or_copy "$d" "$d"; done

# --- git hooks: `git pull` re-syncs settings.json and relinks missing links -----
if [ "$MODE" = link ] && [ "$RESOURCES_ONLY" = 0 ] && [ -z "${PI_SETUP_NO_HOOKS:-}" ] && HOOKS="$(git -C "$REPO" rev-parse --git-path hooks 2>/dev/null)"; then
  case "$HOOKS" in /*) ;; *) HOOKS="$REPO/$HOOKS" ;; esac
  for h in post-merge post-rewrite; do
    if [ -e "$HOOKS/$h" ] && ! grep -q 'pi-setup sync hook' "$HOOKS/$h"; then
      say "! $HOOKS/$h exists and is not ours; not replaced (add: bin/sync-settings.sh --hook)"
      continue
    fi
    if [ "$DRY" = 1 ]; then say "  would: install git hook $h"; continue; fi
    mkdir -p "$HOOKS"
    printf '#!/bin/sh\n# pi-setup sync hook (installed by bin/install.sh --link)\nexec "%s/bin/sync-settings.sh" --hook "--dest=%s"\n' "$REPO" "$DST" > "$HOOKS/$h"
    chmod +x "$HOOKS/$h"
    say "+ git hook $h"
  done
fi

[ -d "$BACKUP" ] && say "replaced files backed up in $BACKUP"

cat <<'EOF'

Done. Remaining manual steps on a fresh machine:
  1. Before starting pi, run npm ci --ignore-scripts --omit=optional --legacy-peer-deps inside <installed agent home>/packages/research-runtime (not the checkout after a copy install).
  2. Start pi and sign in to each provider (auth.json is intentionally not packaged). Pi installs declared npm packages on first launch.
  3. MCP servers in mcp.json (consensus, researchfasttrack) need their own OAuth on first use.
  4. Optional helper binaries (<agent home>/bin/rg, fd) are platform-specific; install locally if wanted.
  5. enabledModels assumes the same provider set; prune entries for providers you do not have.
  6. Windows: pi uses Git Bash; install Git for Windows if pi cannot find a shell.
EOF
