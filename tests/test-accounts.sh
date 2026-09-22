#!/usr/bin/env bash
# Offline fake-Pi test: no credentials or real Pi invocation.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
export PI_ACCOUNT_ROOT="$T/profiles with spaces" PI_ACCOUNT_DEFAULT_DIR="$T/default"
mkdir -p "$PI_ACCOUNT_DEFAULT_DIR" "$T/bin"
printf 'untouched-fixture\n' > "$PI_ACCOUNT_DEFAULT_DIR/auth.json"
cat > "$T/bin/pi" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$PI_CODING_AGENT_DIR" "${PI_CODING_AGENT_SESSION_DIR:-unset}" "$@"
EOF
chmod +x "$T/bin/pi"
export PATH="$T/bin:$PATH"
A="$REPO/bin/pi-account"
"$A" create second
mode="$(stat -c %a "$PI_ACCOUNT_ROOT/second")"
[[ "${mode: -3}" == 700 ]] || exit 1
[[ ! -e "$PI_ACCOUNT_ROOT/second/auth.json" ]]
if "$A" create second; then exit 1; fi
if "$A" create ../escape; then exit 1; fi
if "$A" create default; then exit 1; fi
if "$A" use absent; then exit 1; fi
[[ $("$A" list) == $'default\nsecond' ]]
export PI_CODING_AGENT_SESSION_DIR=wrong
result="$("$A" use second --thinking high)"
[[ "$result" == "$PI_ACCOUNT_ROOT/second"$'\nunset\n--provider\nopenai-codex\n--thinking\nhigh' ]]
[[ $("$A" use default) == "$PI_ACCOUNT_DEFAULT_DIR"$'\nunset\n--provider\nopenai-codex' ]]
grep -qx untouched-fixture "$PI_ACCOUNT_DEFAULT_DIR/auth.json"
ln -s "$PI_ACCOUNT_DEFAULT_DIR" "$PI_ACCOUNT_ROOT/alias"
if "$A" use alias; then exit 1; fi
printf 'Account profile tests passed (offline).\n'
