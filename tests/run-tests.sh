#!/usr/bin/env bash
# Offline self-check for this pi setup. Safe: no network, no credentials, no writes
# outside temp dirs. Run from anywhere:  ./tests/run-tests.sh
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"
. bin/common.sh
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  FAIL %s\n' "$1"; }
# subshell: a cd inside a check must not leak into later checks
check(){ if ( eval "$2" ) >/dev/null 2>&1; then ok "$1"; else bad "$1"; fi; }

echo "pi setup self-check  (os=$(pi_os))"

echo "[1] script syntax"
for f in bin/*.sh optional/mineru/install.sh tests/run-tests.sh; do
  check "$f parses" "bash -n '$f'"
done

echo "[2] no CRLF in scripts (breaks Git Bash)"
for f in bin/*.sh optional/mineru/install.sh; do
  if grep -qU $'\r' "$f" 2>/dev/null; then bad "$f has CRLF"; else ok "$f is LF"; fi
done

echo "[3] config, skills and cross-references"
PY="$(pi_python || true)"
if [ -z "$PY" ]; then
  echo "  skip (no python3 found)"
else
  $PY - <<'EOF' && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
import json,re,pathlib,sys
root=pathlib.Path('.'); bad=[]
for p in list(root.glob('config/*.json'))+list(root.glob('optional/**/*.template')):
    try: json.load(open(p))
    except Exception as e: bad.append(f"invalid JSON {p}: {e}")
try:
    providers=json.load(open(root/'config/models.json'))['providers']
    if any(p.startswith('openai-codex') for p in providers): bad.append('obsolete Codex provider configuration')
    for provider in ('openai','openai-2'):
        overrides=providers[provider]['modelOverrides']
        for model in ('gpt-6.1-sol','gpt-6-astra'):
            entry=overrides.get(model,{})
            if entry.get('contextWindow') != 150000 or entry.get('maxTokens') != 32000:
                bad.append(f'{provider} {model} limits must be 150000/32000')
        luna=overrides.get('gpt-6-luna',{})
        if luna.get('contextWindow') != 100000 or luna.get('maxTokens') != 24000:
            bad.append(f'{provider} Luna limits must be 100000/24000')
    gemini=json.load(open(root/'config/models.json'))['providers']['antigravity']['modelOverrides'].get('gemini-3.8-flash',{})
    if gemini.get('contextWindow') != 150000 or gemini.get('maxTokens') != 32000:
        bad.append('Gemini Flash limits must be 150000/32000')
    settings=json.load(open(root/'config/settings.json'))
    enabled=set(settings.get('enabledModels',[]))
    roles=settings.get('subagents',{}).get('agentOverrides',{})
    role_targets = {
        'worker': ('openai/gpt-6.1-sol',),
        'scout': ('openai/gpt-6.1-sol',),
        'researcher': ('openai/gpt-6.1-sol',),
        'reviewer': ('openai/gpt-6-astra', 'openai-2/gpt-6-astra'),
        'oracle': ('openai/gpt-6-astra',),
        'evidence-auditor': ('openai/gpt-6-astra',),
        'literature-coordinator': ('openai/gpt-6-astra',),
        'literature-leaf': ('openai/gpt-6.1-sol',),
        'literature-reviewer': ('openai/gpt-6-astra',),
    }
    for role, allowed in role_targets.items():
        actual = roles.get(role, {}).get('model')
        if actual not in allowed: bad.append(f'{role} model override mismatch')
        if actual not in enabled: bad.append(f'{role} model is not enabled: {actual}')
except Exception as e: bad.append(f'model routing config invalid: {e}')
for sk in sorted(root.glob('skills/*/SKILL.md'))+sorted(root.glob('roles/*/skills/*/SKILL.md')):
    t=sk.read_text()
    if not t.startswith('---'): bad.append(f"no frontmatter {sk}"); continue
    fm=t.split('---')[1]
    n=re.search(r'^name:\s*(.+)$',fm,re.M); d=re.search(r'^description:\s*(.+)$',fm,re.M)
    if not d or not d.group(1).strip(): bad.append(f"missing description {sk}")
    if not n: bad.append(f"missing name {sk}")
    elif n.group(1).strip().strip('"')!=sk.parent.name: bad.append(f"name/dir mismatch {sk}")
link=re.compile(r'\[[^\]]*\]\(([^)#:]+\.(?:md|py|txt|png|json))\)')
tick=re.compile(r'`(references/[^`]+|scripts/[^`]+)`')
for md in list(root.glob('skills/**/*.md'))+list(root.glob('roles/**/*.md'))+list(root.glob('extensions/**/*.md')):
    txt=md.read_text()
    for m in list(link.finditer(txt))+list(tick.finditer(txt)):
        if not (md.parent/m.group(1)).exists(): bad.append(f"broken ref {md} -> {m.group(1)}")
for b in bad: print("  FAIL",b)
if not bad: print("  ok   config JSON, skill frontmatter, cross-references")
sys.exit(1 if bad else 0)
EOF
fi

if [ -n "$PY" ]; then
  check "research-control policy regression" "\"$PY\" tests/test-research-control.py"
fi

echo "[4] extension unit tests"
if command -v node >/dev/null 2>&1; then
  for t in extensions/*/test-*.mjs; do
    check "$t" "cd '$(dirname "$t")' && node --test '$(basename "$t")'"
  done
else
  echo "  skip (no node)"
fi

echo "[5] install/export round trip"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
check "install into scratch dir" "./bin/install.sh --dest='$T'"
check "installed AGENTS.md" "[ -f '$T/AGENTS.md' ]"
check "installed skills/pdf-read" "[ -f '$T/skills/pdf-read/SKILL.md' ]"
check "installed role skill" "[ -f '$T/roles/literature-reviewer/skills/research-ideas/SKILL.md' ]"
check "rerun is idempotent" "./bin/install.sh --dest='$T'"
check "unknown flag rejected" "! ./bin/install.sh --nope"
S="$T/dir with spaces/agent"
check "path with spaces" "./bin/install.sh --dest='$S' && [ -d '$S/skills' ]"
L="$T/linked-agent"
mkdir -p "$L"
printf 'local settings\n' > "$L/settings.json"
printf 'local instructions\n' > "$L/AGENTS.md"
if pi_symlinks_work; then
  check "resource-only links preserve config" "./bin/install.sh --link --resources-only --dest='$L' && [ -L '$L/skills' ] && [ -L '$L/extensions' ] && [ -L '$L/roles' ] && grep -qx 'local settings' '$L/settings.json' && grep -qx 'local instructions' '$L/AGENTS.md' && [ ! -e '$L/models.json' ]"
  check "linked rerun needs no backup" "./bin/install.sh --link --resources-only --dest='$L' && [ ! -e '$L/backups' ]"
fi
check "export dry-run" "PI_CODING_AGENT_DIR='$T' ./bin/export.sh --dry-run"
check "no export stage leftovers" "[ -z \"\$(ls -d '$REPO'/.export-stage-* 2>/dev/null)\" ]"

echo "[6] mineru installer (no download)"
if command -v uv >/dev/null 2>&1; then
  check "dry-run fresh" "MINERU_HOME='$T/m' ./optional/mineru/install.sh --dry-run"
  check "relaxed torch dry-run" "MINERU_HOME='$T/m' MINERU_RELAX_TORCH=1 ./optional/mineru/install.sh --dry-run"
else
  check "missing uv reported clearly" "! MINERU_HOME='$T/m' ./optional/mineru/install.sh --dry-run > '$T/uv.out' 2>&1; grep -q 'uv not found' '$T/uv.out'"
fi
mkdir -p "$T/w/mineru-venv/Scripts"; printf '#!/bin/sh\necho mineru, version 3.4.5\n' > "$T/w/mineru-venv/Scripts/mineru.exe"; chmod +x "$T/w/mineru-venv/Scripts/mineru.exe"
# no pipeline into grep -q here: pipefail would report the SIGPIPE'd producer as a failure
check "windows Scripts/ layout detected" "MINERU_HOME='$T/w' ./optional/mineru/install.sh --dry-run > '$T/win.out' 2>&1 && grep -q 'already present' '$T/win.out' && grep -q 'Scripts/hf' '$T/win.out'"

echo
echo "passed: $PASS   failed: $FAIL"
[ "$FAIL" -eq 0 ]
