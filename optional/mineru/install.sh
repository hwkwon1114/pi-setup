#!/usr/bin/env bash
# Install the optional local MinerU equation backend used by the pdf-read skill.
#
#   ./optional/mineru/install.sh                 # install into $MINERU_HOME
#   MINERU_HOME=/data/mineru ./install.sh        # custom location
#   ./optional/mineru/install.sh --dry-run       # show the plan, download nothing
#   ./optional/mineru/install.sh --venv-only     # skip the ~1 GB model download
#
# Downloads roughly 2.2 GB (1.2 GB venv + 1.0 GB models) from PyPI and HuggingFace.
# Nothing is installed system-wide; everything lands under $MINERU_HOME.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MINERU_HOME="${MINERU_HOME:-$HOME/tmp/pdf-equation-benchmark}"
PYTHON_VERSION=3.12
MODEL_REPO=opendatalab/PDF-Extract-Kit-1.0
MODEL_REVISION=ed6b654c018d742e65a17671e379c5e6ecc87ec9   # pinned snapshot from the local pilot
DRY=0
VENV_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --venv-only) VENV_ONLY=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

VENV="$MINERU_HOME/mineru-venv"
CACHE="$MINERU_HOME/mineru-cache"
CONFIG="$MINERU_HOME/mineru.json"

run() { if [ "$DRY" = 1 ]; then printf '  would: %s\n' "$*"; else "$@"; fi; }

echo "MinerU 3.4.5 -> $MINERU_HOME  (dry-run=$DRY, venv-only=$VENV_ONLY)"

if ! command -v uv >/dev/null 2>&1; then
  cat >&2 <<'EOF'
error: uv not found. Install it first, e.g.
  curl -LsSf https://astral.sh/uv/install.sh | sh
uv is used because the lockfile is a flat pinned set and uv fetches its own Python.
EOF
  exit 1
fi

# --- 1. virtualenv with pinned dependencies -----------------------------------
if [ -x "$VENV/bin/mineru" ]; then
  echo "= venv already present ($("$VENV/bin/mineru" --version 2>&1 | tail -1))"
else
  run mkdir -p "$MINERU_HOME"
  run uv venv --python "$PYTHON_VERSION" "$VENV"
  run uv pip install --python "$VENV/bin/python" -r "$HERE/requirements.lock.txt"
fi

if [ "$VENV_ONLY" = 1 ]; then
  echo "Stopped after venv as requested. Re-run without --venv-only to fetch models."
  exit 0
fi

# --- 2. model snapshot ---------------------------------------------------------
run mkdir -p "$CACHE"
if [ "$DRY" = 1 ]; then
  echo "  would: HF_HOME=$CACHE hf download $MODEL_REPO --revision $MODEL_REVISION"
else
  HF_HOME="$CACHE" "$VENV/bin/hf" download "$MODEL_REPO" --revision "$MODEL_REVISION" >/dev/null
fi

SNAPSHOT="$CACHE/hub/models--${MODEL_REPO/\//--}/snapshots/$MODEL_REVISION"
if [ "$DRY" = 0 ] && [ ! -d "$SNAPSHOT/models" ]; then
  echo "error: expected model tree missing at $SNAPSHOT/models" >&2
  exit 1
fi

# --- 3. config with resolved model path ----------------------------------------
if [ "$DRY" = 1 ]; then
  echo "  would: write $CONFIG with models-dir.pipeline=$SNAPSHOT"
else
  sed "s|__MINERU_MODELS_DIR__|$SNAPSHOT|" "$HERE/mineru.json.template" > "$CONFIG"
fi

# --- 4. verification ------------------------------------------------------------
if [ "$DRY" = 0 ]; then
  echo
  echo "Installed: $("$VENV/bin/mineru" --version 2>&1 | tail -1)"
  echo "Models:    $(ls "$SNAPSHOT/models" | tr '\n' ' ')"
  echo "Config:    $CONFIG"
fi

cat <<EOF

Add to your shell profile so the pdf-read skill finds it:
  export MINERU_HOME="$MINERU_HOME"

Smoke test on one page of any PDF (zero-based page indices):
  OUT=\$(mktemp -d)/mineru-page-0001
  mkdir -p "\$OUT"
  HF_HOME="$CACHE" MINERU_TOOLS_CONFIG_JSON="$CONFIG" \\
  MINERU_MODEL_SOURCE=huggingface MINERU_DEVICE_MODE=cpu \\
  "$VENV/bin/mineru" -p /absolute/paper.pdf -o "\$OUT" \\
    -b pipeline -m txt -s 0 -e 0 -f true -t false
EOF
