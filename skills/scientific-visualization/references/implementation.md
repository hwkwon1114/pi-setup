# Implementation starting point

Use the project's existing Python environment and dependency lock. Matplotlib is required for this example; Seaborn is optional for other plots. Request approval before dependency installation. Resolve the style path relative to this skill directory, not the working directory. Do not use machine-specific paths in project code; copy the style into the project when appropriate and record its source.

## Reference/prediction time-series example

Adapt the function below in a project plotting script. It performs only basic shape/order checks; it cannot verify time alignment, units, sampling design, or scientific correctness. NaNs are retained as gaps. Missing timestamps must be identified and inserted explicitly upstream if the file omits them entirely. No uncertainty is invented.

```python
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt


def validation_figure(time, measured, predicted, *, style_path, quantity, unit):
    time, measured, predicted = (
        np.asarray(values, dtype=float) for values in (time, measured, predicted)
    )
    if any(values.ndim != 1 for values in (time, measured, predicted)):
        raise ValueError("Inputs must be one-dimensional")
    if not (len(time) == len(measured) == len(predicted)) or len(time) < 2:
        raise ValueError("Inputs must have equal lengths of at least two")
    if not np.isfinite(time).all() or not (np.diff(time) > 0).all():
        raise ValueError("Time must be finite and strictly increasing")
    if np.isinf(measured).any() or np.isinf(predicted).any():
        raise ValueError("Use documented missing values, not infinity")
    if not (np.isfinite(measured) & np.isfinite(predicted)).any():
        raise ValueError("At least one finite measured/predicted pair is required")
    suffix = f" ({unit})" if unit else ""
    with plt.style.context(str(style_path)):
        fig, axes = plt.subplots(
            2, 1, sharex=True, figsize=(89 / 25.4, 95 / 25.4),
            layout="constrained", gridspec_kw={"height_ratios": [2, 1]},
        )
        axes[0].plot(time, measured, color="#333333", marker="o", label="Reference")
        axes[0].plot(time, predicted, color="#0072B2", linestyle="--", label="Prediction")
        axes[0].set_ylabel(quantity + suffix)
        axes[0].legend()
        axes[1].plot(time, predicted - measured, color="#0072B2", marker="o")
        axes[1].axhline(0, color="#666666", linewidth=0.6, linestyle=":")
        axes[1].set(xlabel="Time (s)", ylabel="Residual" + suffix)
        for label, ax in zip(("(a)", "(b)"), axes):
            ax.set_title(label, loc="left")
    return fig
```

Markers keep isolated finite observations visible next to gaps. For dense traces, adapt marker density without hiding isolated observations or transients. The example assumes input time is in seconds. Change labels or convert explicitly for other units. Dimensions are provisional, not publisher requirements. The residual convention is prediction minus reference and must appear in the caption. The variable `measured` can hold observed data or an appropriate reference solution; identify which in the caption. This time-series example is not a required layout for other computational results.

## Export

Create a new output directory or confirm existing files may be replaced. Check all target paths before saving; `savefig` itself overwrites existing files. Use a scoped style context during export as well as creation so font embedding/export settings apply:

```python
# fig is the figure returned above; skill_dir and output_dir are resolved Paths.
stem = "response_prediction_validation"
targets = [output_dir / f"{stem}.{extension}" for extension in ("pdf", "png")]
if any(path.exists() or path.is_symlink() for path in targets):
    raise FileExistsError("Figure output already exists; choose a new destination or seek approval")
output_dir.mkdir(parents=True, exist_ok=True)
with plt.style.context(str(skill_dir / "assets/publication.mplstyle")):
    fig.savefig(targets[0], bbox_inches=None)
    fig.savefig(targets[1], dpi=300, bbox_inches=None)
plt.close(fig)
```

This is a simple single-process example, not an atomic exporter or a concurrent-write guard. A partial export can remain after failure; report it. The PNG is a preview; select final raster DPI from actual requirements. `svg.fonttype: none` preserves SVG text but depends on fonts installed on the viewing machine; PDF Type 42 settings do not guarantee every font or renderer will behave correctly.

## Reproducibility record

Alongside the project script and caption, save a small JSON/YAML record or equivalent project manifest containing:

- Canonical stem and actual output paths.
- Source data paths/identifiers (and checksums where practical).
- Model version, run IDs, and evaluation split.
- Quantity names, units, independent sampling unit and sample count.
- Filtering, resampling, alignment, exclusions, normalization, and missing-value handling.
- Estimator, interval definition/method, and random seeds where relevant.
- Python/library versions and regeneration command.
- Intended physical dimensions and export settings.

Do not leak confidential paths or metadata into public figure releases. Preserve private provenance locally and prepare a deliberate public subset.

## Review scope

Inspect both source semantics and rendered files. Check PDF separately when delivered; PNG inspection alone does not verify PDF. Palette names, font settings, and successful export are not proof of accessibility, correctness, or publisher compliance.
