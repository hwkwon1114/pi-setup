#!/usr/bin/env bash
# Pull the live pi agent home back into this repo, so the package stays current.
#
#   ./bin/export.sh             # sync ~/.pi/agent -> repo
#   ./bin/export.sh --dry-run
#
# Only portable material is copied. Credentials and state are never exported.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${PI_AGENT_HOME:-$HOME/.pi/agent}"
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
  run rm -rf "$REPO/$d"
  run cp -R "$SRC/$d" "$REPO/$d"
  echo "+ $d/"
done

run cp "$SRC/AGENTS.md" "$REPO/config/AGENTS.md"
for f in models.json mcp.json; do
  [ -f "$SRC/$f" ] && run cp "$SRC/$f" "$REPO/config/$f"
done

# settings.json minus machine-local bookkeeping
if [ "$DRY" = 0 ] && [ -f "$SRC/settings.json" ]; then
  python3 - "$SRC/settings.json" "$REPO/config/settings.json" <<'PY'
import json, sys
src, dst = sys.argv[1], sys.argv[2]
s = json.load(open(src))
for k in ("lastChangelogVersion",):
    s.pop(k, None)
open(dst, "w").write(json.dumps(s, indent=2) + "\n")
PY
fi
echo "+ config/"

run find "$REPO" -name '.DS_Store' -delete
echo "Exported $SRC -> $REPO. Review with 'git diff' before committing."
