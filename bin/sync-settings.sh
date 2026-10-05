#!/usr/bin/env bash
# Sync this checkout into a linked pi agent home after `git pull`.
# Installed as .git/hooks/post-merge and post-rewrite by `bin/install.sh --link`.
#
#   bin/sync-settings.sh            # apply config/settings.json if no local edits
#   bin/sync-settings.sh --force    # apply anyway (live copy backed up)
#   bin/sync-settings.sh --hook     # used by git hooks (baseline = ORIG_HEAD)
#
# Skills, extensions, roles, agents, packages, AGENTS.md, models.json and
# mcp.json are symlinks and need no copy; this re-links any that went missing
# and copies settings.json, which pi rewrites in place and so cannot be linked.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$REPO/bin/common.sh"
DST="$(pi_agent_home)"
FORCE=() HOOK=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=(--force) ;;
    --hook) HOOK=1 ;;
    --dest=*) DST="${arg#--dest=}" ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# shellcheck source=link-targets.sh
. "$REPO/bin/link-targets.sh"
for rel in "${PI_LINK_DIRS[@]}" "${PI_LINK_FILES[@]}"; do
  name="${rel##*/}"; want="$REPO/$rel"
  [ -e "$want" ] || continue
  if [ -L "$DST/$name" ] && [ "$(readlink "$DST/$name")" = "$want" ]; then continue; fi
  if [ -e "$DST/$name" ] || [ -L "$DST/$name" ]; then
    echo "! $DST/$name is not linked to $want; run bin/install.sh --link" >&2
  else
    ln -s "$want" "$DST/$name" && echo "+ relinked $name"
  fi
done

PY_CMD="$(pi_python || true)"
if [ -z "$PY_CMD" ]; then
  echo "! no python3: settings.json not synced" >&2; exit 0
fi
BASE=()
if [ "$HOOK" = 1 ]; then
  tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
  if git -C "$REPO" show ORIG_HEAD:config/settings.json > "$tmp" 2>/dev/null; then BASE=(--base "$tmp"); fi
fi
status=0
$PY_CMD "$REPO/bin/sync-settings.py" "$REPO/config/settings.json" "$DST/settings.json" \
  ${BASE[@]+"${BASE[@]}"} ${FORCE[@]+"${FORCE[@]}"} || status=$?
# A hook must never fail the pull; local edits are reported above.
if [ "$HOOK" = 1 ]; then
  echo "pi-setup: run /reload in pi (restart if extensions changed)."
  exit 0
fi
exit "$status"
