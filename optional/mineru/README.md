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

## Install on another computer

```bash
# 1. prerequisite: uv (fetches its own Python 3.12)
curl -LsSf https://astral.sh/uv/install.sh | sh

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

## Verify

```bash
[ -x "$MINERU_HOME/mineru-venv/bin/mineru" ] && "$MINERU_HOME/mineru-venv/bin/mineru" --version
ls "$MINERU_HOME/mineru-cache/hub/models--opendatalab--PDF-Extract-Kit-1.0/snapshots/"*/models
```

Expect `mineru, version 3.4.5` and `Layout MFR OCR`. Then run the smoke test that
`install.sh` prints on completion.

## Caveats

- **Platform.** The lockfile was resolved on macOS arm64. On Linux/CUDA, `torch==2.14.0`
  may need an extra index (`--index-url https://download.pytorch.org/whl/cu124`) or a
  different pin; on x86 macOS some wheels differ. If resolution fails, relax `torch`/
  `torchvision` first and record what you changed.
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
