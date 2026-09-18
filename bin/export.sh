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

for d in skills extensions roles; do
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

run cp "$SRC/AGENTS.md" "$REPO/config/AGENTS.md"
for f in models.json mcp.json; do
  [ -f "$SRC/$f" ] && run cp "$SRC/$f" "$REPO/config/$f"
done

# settings.json minus machine-local bookkeeping
PY_CMD="$(pi_python || true)"
if [ "$DRY" = 0 ] && [ -f "$SRC/settings.json" ] && [ -n "$PY_CMD" ]; then
  $PY_CMD - "$SRC/settings.json" "$REPO/config/settings.json" <<'PY'
import json, sys
src, dst = sys.argv[1], sys.argv[2]
s = json.load(open(src))
for k in ("lastChangelogVersion",):
    s.pop(k, None)
open(dst, "w").write(json.dumps(s, indent=2) + "\n")
PY
elif [ "$DRY" = 0 ] && [ -f "$SRC/settings.json" ]; then
  echo "! no python3 found: copying settings.json verbatim; remove lastChangelogVersion by hand" >&2
  cp "$SRC/settings.json" "$REPO/config/settings.json"
fi
echo "+ config/"

run find "$REPO" -name '.DS_Store' -delete
run rm -rf "$REPO"/.export-stage-*
echo "Exported $SRC -> $REPO. Review with 'git diff' before committing."
