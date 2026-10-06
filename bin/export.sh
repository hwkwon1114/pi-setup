#!/usr/bin/env bash
# Pull the live pi agent home back into this repo, so the package stays current.
#
#   ./bin/export.sh             # sync ~/.pi/agent -> repo
#   ./bin/export.sh --dry-run
#
# Only portable material is copied. Credentials and state are never exported.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$REPO/bin/common.sh"
SRC="$(pi_agent_home)"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

run() { if [ "$DRY" = 1 ]; then printf '  would: %s\n' "$*"; else "$@"; fi; }

for d in skills extensions roles agents; do
  [ -d "$SRC/$d" ] || continue
  # skip if the live dir is a symlink back into this repo (--link install)
  if [ -L "$SRC/$d" ] && [ "$(readlink "$SRC/$d")" = "$REPO/$d" ]; then
    echo "= $d/ (symlinked to repo)"
    continue
  fi
  # stage then swap: an interrupted copy must not leave the repo without $d
  if [ "$DRY" = 1 ]; then
    echo "  would: stage $SRC/$d then replace $REPO/$d"
  else
    stage="$REPO/.export-stage-$d.$$"
    rm -rf "$stage"
    cp -R "$SRC/$d" "$stage"
    rm -rf "$REPO/$d"
    mv "$stage" "$REPO/$d"
  fi
  echo "+ $d/"
done

# JSON is deliberately never exported: it contains machine-local overrides.
# Promote portable preferences by editing config/*.json explicitly.
for f in AGENTS.md; do
  [ -f "$SRC/$f" ] || continue
  if [ -L "$SRC/$f" ] && [ "$(readlink "$SRC/$f")" = "$REPO/config/$f" ]; then
    echo "= $f (symlinked to repo)"; continue
  fi
  run cp "$SRC/$f" "$REPO/config/$f"
done

echo '= settings/models/MCP kept private; edit shared config/*.json explicitly'

run find "$REPO" -name '.DS_Store' -delete
run rm -rf "$REPO"/.export-stage-*
echo "Exported $SRC -> $REPO. Review with 'git diff' before committing."
