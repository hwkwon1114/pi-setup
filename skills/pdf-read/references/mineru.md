# Optional local equation extraction with MinerU

## Role and evidence limits

Poppler remains the default searchable-text backend. Use MinerU only when candidate LaTeX/structured math is useful. Neither output is authoritative mathematical evidence.

The local pilot used MinerU 3.4.5 pipeline on physical pages 4 and 6 of A47 (arXiv:2310.10776v1). It retained displayed equation structures and numbers better than the other successful configurations, but misread an inline subscript as a superscript and an ordinary plus as a dotted plus. This is not a broad benchmark. Matrices, scanned papers and tables remain untested.

## Locating an installation (machine-specific)

MinerU is never bundled with this skill. Resolve it per machine through `MINERU_HOME`, the directory holding the venv, model cache and config:

```bash
export MINERU_HOME="${MINERU_HOME:-$HOME/tmp/pdf-equation-benchmark}"
```

Within that root:

- Executable: `$MINERU_HOME/mineru-venv/bin/mineru` (Windows: `mineru-venv/Scripts/mineru.exe`)
- Model cache: `$MINERU_HOME/mineru-cache`
- Config: `$MINERU_HOME/mineru.json`
- Local pilot notes, where they exist: `$MINERU_HOME/mineru-results/assessment.md`

The default fallback is a temporary-workspace path from the original pilot machine; it is not portable or guaranteed permanent. Confirm availability before any use, and stop rather than substituting another backend:

```bash
MINERU_BIN="$MINERU_HOME/mineru-venv/bin/mineru"
[ -d "$MINERU_HOME/mineru-venv/Scripts" ] && MINERU_BIN="$MINERU_HOME/mineru-venv/Scripts/mineru.exe"
[ -x "$MINERU_BIN" ] || [ -f "$MINERU_BIN" ] || echo "MinerU unavailable; stay on Poppler"
```

If it is absent, report the optional backend as unavailable and continue with Poppler. Do not automatically install, reinstall or migrate it. Ask before additional dependency installations or new model downloads. Do not enable remote HTTP backends, cloud parsing, or LLM-assisted services without separate authorization.

## Invocation

First run the standard Poppler helper to establish source SHA-256 and physical page numbering. Select equation-heavy pages from that text. Reserve a NEW output directory (never reuse prior raw output). Record the exact command, version, source hash and page mapping in reading-notes.md before conversion.

Example for physical PDF page 6 (MinerU CLI uses ZERO-based indices):

```bash
# Set this to a new absolute destination outside the source PDF directory.
OUT=/absolute/new-mineru-page-0006
mkdir "$OUT" || exit 1
HF_HOME="$MINERU_HOME/mineru-cache" \
MINERU_TOOLS_CONFIG_JSON="$MINERU_HOME/mineru.json" \
MINERU_MODEL_SOURCE=huggingface \
MINERU_DEVICE_MODE=cpu \
"$MINERU_BIN" \
  -p /absolute/original.pdf -o "$OUT" \
  -b pipeline -m txt -s 5 -e 5 -f true -t false \
  > "$OUT/run.log" 2>&1
```

Use a bounded command timeout appropriate to the selected pages. The benchmark used CPU; do not silently switch to a remote backend to resolve slowness. Model downloads may occur if cache files are absent. `txt` mode is NOT an OCR-free guarantee: the tested pipeline also ran OCR detection. MinerU's CLI starts a temporary local API process; this is not a cloud parser.

For disjoint pages, prefer separate page-named output directories. Preserve mapping explicitly: output-local page indices may restart at zero. Keep raw Markdown, JSON, extracted images and logs. Derivative PDFs are not replacements for the source. Record failures/timeouts as partial or failed, not completed extraction. Verify the original hash again after conversion.

## Verification and reporting

1. Render each original page supporting consequential mathematics using Poppler (see SKILL.md).
2. Compare the candidate against the original image, NOT against another parser's text.
3. Check equation completeness, symbols, signs, superscripts/subscripts, fractions, summation bounds, conditioning, matrix dimensions and equation numbers. Check inline and caption math too.
4. Keep raw output unchanged. Write any checked/corrected transcription in a separate file with physical page and equation identifier.
5. For each transcription assign a descriptive status: `unverified`, `visually checked`, or `unresolved`. A visually checked transcription is not a proof that the source equation is mathematically valid.
6. Record every correction and its original visual evidence. Preserve apparent author typos; discuss them separately rather than silently fixing them.
7. Conversion success, well-formed Markdown and absent warnings do not establish mathematical fidelity. Neither full extraction nor checking a few equations is full-paper reading.
