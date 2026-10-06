#!/usr/bin/env bash
# Compose shared JSON defaults + private machine overrides. Never export live JSON.
# --capture-local explicitly preserves unrecorded Pi/UI edits as local overrides.
# --hook is installed by install.sh --link; refusal warns without failing git pull.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$REPO/bin/common.sh"
DST="$(pi_agent_home)"
ARGS=() HOOK=0
for arg in "$@"; do
  case "$arg" in
    --capture-local|--check) ARGS+=("$arg") ;;
    --hook) HOOK=1 ;;
    --dest=*) DST="${arg#--dest=}" ;;
    -h|--help) printf '%s\n' 'sync-settings.sh [--dest=PATH] [--capture-local] [--check] [--hook]'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done
PY_CMD="$(pi_python || true)"
if [ -z "$PY_CMD" ]; then echo 'Python 3 required; configuration unchanged' >&2; exit 1; fi
status=0
$PY_CMD "$REPO/bin/sync-settings.py" "$REPO/config" "$DST" ${ARGS[@]+"${ARGS[@]}"} || status=$?
if [ "$HOOK" = 1 ]; then
  if [ "$status" != 0 ]; then echo 'pi-setup: synchronization refused; resolve local edits before reload.' >&2
  else echo 'pi-setup: configuration synced; reload/restart Pi to activate.'; fi
  exit 0
fi
exit "$status"
