# Optional: local MinerU equation backend

MinerU converts PDF pages to Markdown with candidate LaTeX. The `pdf-read` skill uses
it **only** for equation-heavy pages; Poppler remains the default for all text
extraction and page rendering. Without MinerU the skill still works — it reports the
optional backend as unavailable.

## What is packaged here

| File | Purpose |
| --- | --- |
| `install.sh` | Builds the venv, fetches the pinned model snapshot, writes `mineru.json` |
| `requirements.lock.txt` | 109 fully pinned deps (`mineru==3.4.5`, `torch==2.14.0`, `transformers==4.57.6`) |
| `mineru.json.template` | MinerU config; `models-dir.pipeline` filled in at install time |

The venv (1.2 GB) and model cache (1.0 GB) are **not** in git — they are rebuilt from
the lockfile and the pinned HuggingFace revision `ed6b654c` of
`opendatalab/PDF-Extract-Kit-1.0` (Layout, MFR, OCR models).

## Platform support

| Platform | Lockfile resolves | Notes |
| --- | --- | --- |
| macOS arm64 | yes (in use) | Requires macOS 14+; `onnxruntime` has no macOS 13 wheel |
| Linux x86_64 | yes, verified | PyPI `torch==2.14.0` is the CUDA build; pulls `triton` |
| Windows x86_64 | yes, verified | Run from Git Bash; venv uses `Scripts/`, not `bin/` |
| Windows arm64 / Linux arm64 | untested | Expect missing `torch` wheels; try `MINERU_RELAX_TORCH=1` |

Verified with `uv pip compile --python-platform ...` for each target: `mineru==3.4.5`,
`torch==2.14.0`, `torchvision==0.29.0` all resolve. Linux resolution was additionally
confirmed by a real `uv pip install --dry-run` in a `python:3.12-slim` container.

## Install on another computer

```bash
# 1. prerequisite: uv (fetches its own Python 3.12)
curl -LsSf https://astral.sh/uv/install.sh | sh     # macOS / Linux / WSL / Git Bash
# Windows PowerShell alternative: irm https://astral.sh/uv/install.ps1 | iex

# 2. choose a location (default: ~/tmp/pdf-equation-benchmark)
export MINERU_HOME="$HOME/pi-tools/mineru"

# 3. preview, then install (~2.2 GB download)
cd ~/Documents/pi-setup
./optional/mineru/install.sh --dry-run
./optional/mineru/install.sh

# 4. make it discoverable to the skill
echo "export MINERU_HOME=\"$MINERU_HOME\"" >> ~/.zshrc
```

`--venv-only` skips the model download if you want to stage the two steps.
Re-running is safe: an existing venv is detected, and the HF download resumes.

On **Windows**, run this from Git Bash (the shell pi itself uses), not PowerShell:

```bash
export MINERU_HOME="$HOME/pi-tools/mineru"
./optional/mineru/install.sh
```

The script detects the `Scripts/` venv layout and `.exe` suffixes automatically.

If the pinned `torch`/`torchvision` have no wheel for your platform:

```bash
MINERU_TORCH_INDEX=https://download.pytorch.org/whl/cpu ./optional/mineru/install.sh  # CPU-only wheels
MINERU_RELAX_TORCH=1 ./optional/mineru/install.sh                                     # let uv pick versions
```

## Verify

```bash
[ -x "$MINERU_HOME/mineru-venv/bin/mineru" ] && "$MINERU_HOME/mineru-venv/bin/mineru" --version
ls "$MINERU_HOME/mineru-cache/hub/models--opendatalab--PDF-Extract-Kit-1.0/snapshots/"*/models
```

Expect `mineru, version 3.4.5` and `Layout MFR OCR`. Then run the smoke test that
`install.sh` prints on completion.

## Caveats

- **Platform.** The lockfile was authored on macOS arm64 but resolves unchanged on
  Linux and Windows x86_64 (verified). On Linux the PyPI `torch` wheel is the large
  CUDA build even without a GPU — use `MINERU_TORCH_INDEX=.../whl/cpu` to stay slim.
  ARM Linux/Windows are untested. Record any change you make to the pins.
- **CPU by default.** The pilot ran `MINERU_DEVICE_MODE=cpu`. Expect minutes per page.
  Do not switch to a remote/cloud backend to fix slowness.
- **Accuracy is unestablished.** Evidence is a two-page pilot on one arXiv paper: it kept
  displayed-equation structure better than Docling/Marker but misread a subscript as a
  superscript and a plus as a dotted plus. Matrices, tables and scanned pages are
  untested. Treat every transcription as an unverified candidate and visually check it
  against the rendered original page, per `skills/pdf-read/references/mineru.md`.
- **Network.** Installation pulls from PyPI and HuggingFace. The config template ships
  with MinerU's own placeholder `bucket_info` and a disabled `llm-aided-config`; no
  credentials are included and none are needed. Leave the LLM aid disabled unless you
  separately decide otherwise.
