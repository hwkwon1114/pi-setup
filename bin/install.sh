#!/usr/bin/env bash
# Install this pi setup into a pi agent home (default: ~/.pi/agent).
# Runs on macOS, Linux, WSL and Windows (Git Bash / MSYS2 / Cygwin, which is the
# shell pi itself uses on Windows).
#
#   ./bin/install.sh            # copy files (backs up anything replaced)
#   ./bin/install.sh --link     # symlink skills/extensions/roles instead of copying
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
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
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

# --- shared instructions and config files -------------------------------------
for f in AGENTS.md settings.json models.json mcp.json; do
  [ "$RESOURCES_ONLY" = 1 ] && continue
  src="$REPO/config/$f"
  [ -f "$src" ] || continue
  if [ -e "$DST/$f" ] && cmp -s "$src" "$DST/$f"; then
    say "= $f (unchanged)"
    continue
  fi
  backup "$DST/$f"
  run cp "$src" "$DST/$f"
  say "+ $f"
done

# --- directory payloads --------------------------------------------------------
for d in skills extensions roles; do
  [ -d "$REPO/$d" ] || continue
  if [ "$MODE" = link ] && [ -L "$DST/$d" ] && [ "$(readlink "$DST/$d")" = "$REPO/$d" ]; then
    say "= $d/ (already linked)"
    continue
  fi
  backup "$DST/$d"
  if [ "$MODE" = link ]; then
    run ln -s "$REPO/$d" "$DST/$d"
  else
    run cp -R "$REPO/$d" "$DST/$d"
  fi
  say "+ $d/ ($MODE)"
done

[ -d "$BACKUP" ] && say "replaced files backed up in $BACKUP"

cat <<'EOF'

Done. Remaining manual steps on a fresh machine:
  1. Start pi and sign in to each provider (auth.json is intentionally not packaged).
  2. pi installs the npm packages listed in settings.json on first launch; verify with /packages.
  3. MCP servers in mcp.json (consensus, researchfasttrack) need their own OAuth on first use.
  4. Optional helper binaries (<agent home>/bin/rg, fd) are platform-specific; install locally if wanted.
  5. enabledModels assumes the same provider set; prune entries for providers you do not have.
  6. Windows: pi uses Git Bash; install Git for Windows if pi cannot find a shell.
EOF
