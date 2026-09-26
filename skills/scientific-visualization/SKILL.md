---
name: scientific-visualization
description: Design, create, edit, restyle, and review scientific data plots and figures for manuscripts, presentations, and analysis. Use whenever making or changing a figure, plot, chart, or panel - including writing or running a plotting script, calling Matplotlib, Seaborn, savefig, or a figure generator; adjusting axes, ticks, legends, colors, palettes, fonts, annotations, or layout; adding error bars or uncertainty displays; building multi-panel layouts; exporting PDF, PNG, SVG, or TIFF; naming figure files and captions; and reviewing rendered output for clipping, overlap, contrast, or size. Covers simulation results, model validation, optimization histories, and computational benchmarks. Not for AI-generated illustrations or system architecture diagrams.
license: MIT
compatibility: Plotting requires a project Python environment with Matplotlib; Seaborn is optional. Install dependencies only after explicit approval.
metadata:
  adaptation: Local Pi adaptation of K-Dense scientific-visualization
---

# Scientific visualization

Make the evidence easy to read, not decorative. Keep this skill general across computational research: derive terminology, quantities, units, and evaluation structure from the current project rather than assuming an application domain. Default to clean manuscript plots unless the user specifies exploration, slides, or another medium. These are behavioral instructions, not an enforced validator or journal certification.

Adaptation and upstream provenance: [ATTRIBUTION.md](ATTRIBUTION.md).

## Workflow

1. Identify the figure's purpose, data paths, variables and units, independent sampling unit, and intended medium. Ask only for information blocking a truthful plot; list unresolved choices instead of inventing them.
2. Inspect data and transformations before plotting. Distinguish measurements, predictions, interpolations, and synthetic examples. Never fabricate research results or improve appearance by changing data.
3. Select an encoding that answers the scientific question. For validation, simulation, convergence, or benchmark plots, read [references/computational-figures.md](references/computational-figures.md).
4. Apply the concise-text and naming policies below. For implementation, read [references/implementation.md](references/implementation.md) and use [assets/publication.mplstyle](assets/publication.mplstyle) as a provisional starting point.
5. Export from reproducible code, preserve provenance, and inspect the rendered output at intended final size. Separate checks actually performed from checks pending.

For plots involving identifiability, uncertainty quantification (UQ), parameter or predictive calibration, decision-making, or updating machine-learning/Gaussian-process (GP) models, read [references/statistical-figures.md](references/statistical-figures.md). This optional reference guides plot selection and interpretation; it is not a required checklist for unrelated figures or authorization to fit models or run experiments.

## Concise figure text — default policy

- Manuscript figures have **no overall in-figure title** by default. Put identification and explanation in the external caption. A brief title is appropriate for a standalone plot or slide when useful.
- Panel headings are short, neutral noun phrases, preferably 2–5 words: `Model predictions`, `Residuals`, `Prediction coverage`. Do not enforce brevity at the expense of meaning.
- Axis and colorbar labels name the quantity and unit: `Time (s)`, `Iteration`, `Absolute error`. Do not expose raw column names or file paths as labels. Dimensionless quantities need no invented unit.
- Legends use short, unambiguous identifiers: `Reference`, `Prediction`, `Baseline`. Keep method names consistent throughout a project.
- Annotations are limited to necessary events, thresholds, region identifiers, or features. Retain scientifically necessary annotations; move explanatory paragraphs and methodological details to the caption.
- Keep one annotation text size across a figure. When a label must sit inside a shaded span, band, or inset, size that region to its label rather than shrinking the label to fit; shrink-to-fit silently trades legibility for layout and produces inconsistent type. If the region cannot be widened, shorten or wrap the text, or move it outside with a leader.
- Do not add promotional claims such as `Excellent agreement`, `Highly accurate prediction`, or `Superior performance`. Use `Model comparison`, not a conclusion disguised as a label.
- Never bake `Figure 3`, a caption paragraph, or a provenance block into manuscript artwork.
- Use panel identifiers `(a)`, `(b)`, etc. consistently when needed. Identify abbreviations in the caption.
- Do not omit context to meet an arbitrary text budget. A standalone deliverable should include an accompanying caption or description.

Example: replace `Detailed comparison demonstrating highly accurate predictions across all evaluation cases` with no overall title, actual quantity/unit axis labels, and legend `Reference` / `Prediction`.

## Filenames, labels, and captions

Use stable semantic names, independent of manuscript numbering:

- Stem: lowercase snake_case, normally `<subject>_<quantity>_<purpose>`; omit redundant components.
- File: `prediction_error_comparison.pdf`.
- Source: `prediction_error_comparison.py` (or a clearly recorded generating script).
- Caption: `prediction_error_comparison.caption.md`.
- LaTeX label: `fig:prediction-error-comparison`.
- Short caption opening: `Prediction errors across evaluation conditions.`

Extend names with a meaningful condition only when needed to distinguish outputs. Avoid `plot1`, `final_final`, conclusion-based names, spaces, and timestamps in the canonical filename. Use version control for revisions; preserve separate run IDs in provenance when needed. Preserve an existing coherent project naming convention; rename prior artifacts only after explicit approval.

Keep figure numbering in the manuscript. If submission rules require `Fig1.tif`, create submission copies with a mapping to canonical names; do not rename source artifacts. Preserve existing figures: replace only with explicit approval, otherwise choose a distinct output destination.

A caption should identify what each panel shows and include applicable evaluation conditions, transformations, sample size and independent replication unit, uncertainty definition, symbols/abbreviations, and essential interpretation. Do not invent these details. Keep methods out of the artwork, not out of the record.

## Scientific integrity

- Preserve raw inputs, preprocessing, exclusions, seeds, aggregation, smoothing/binning parameters, model/run identifiers, and generating code. Record actual output paths and environment versions.
- Keep missing, zero, censored, excluded, and out-of-range data distinct. Show missing observations as gaps; separately style and disclose interpolation or model estimates.
- Name uncertainty precisely: SD, SE, confidence interval, prediction interval, posterior credible interval, etc. State the level and independent sampling unit. They are not interchangeable.
- Do not treat correlated time samples as independent replicates. Check the data structure before accepting automatic aggregation or bootstrap intervals.
- Bars and area encodings normally start at zero. Nonzero line/scatter axes can be valid; do not engineer misleading comparisons. Prefer aligned panels to dual axes.
- Preserve equal scales and color normalization across directly compared panels. Diverging colors require a meaningful center; sequential colors represent ordered magnitude. Avoid rainbow maps and decorative 3D.
- Declare transformations and handling of invalid values on log scales. Scale marker area, not radius, when encoding magnitude.
- Show raw observations where feasible. Disclose any downsampling; preserve transients and do not use smoothing to hide model failures.
- For spatial fields, preserve geometry/aspect where physically meaningful and provide coordinates, units, and shared scales. Do not turn a schematic or generated image into apparent numerical evidence.

## Visual defaults

- White background; consistent typography; restrained line weights; minimal spines; subtle grids only when useful.
- Use the provisional bundled style through a scoped `plt.style.context`, not persistent global settings. Adjust at the actual intended display width.
- Default to a colorblind-friendly categorical palette with clearly distinguishable entities, not arbitrary or rainbow colors. The bundled style uses a five-color Okabe–Ito subset; read [references/colors-and-entities.md](references/colors-and-entities.md) when assigning entity colors, selecting a colormap, or reviewing distinguishability.
- Never encode entity identity by color alone: pair color with markers, line styles, hatching, direct labels, or panel separation appropriate to the plot. Keep text and tick labels dark and readable.
- Maintain an explicit project-level entity-to-style mapping. The same entity keeps its color and redundant cue across figures, subsets, and reordered data; do not rely on plotting order or silently recycle colors when the palette runs out.
- Review actual rendered contrast and separability at final size, including grayscale and common color-vision-deficiency simulations when available. A palette name or simulation alone does not certify accessibility. Report unavailable checks and simplify/facet crowded plots rather than adding indistinguishable colors.
- Prefer data plots rendered by code to AI image generation. Use Matplotlib's object-oriented API; optional Seaborn axes-level functions fit custom layouts.
- Interactive outputs are separate deliverables: hover text does not replace essential labels, a static fallback, or an accessible data alternative.

## Export and review

- Default to vector PDF plus a PNG preview for ordinary manuscript plots; provide SVG when editability is requested. Raster fields may remain embedded in vector files.
- Set physical size deliberately. Journal dimensions, accepted formats, fonts, and raster DPI depend on the exact journal, figure type, and submission phase. Verify official requirements when relevant; treat `300 DPI` as a context-dependent setting, not a universal rule.
- Dense artists such as shaded meshes, large scatters, and fields make vector files enormous because every primitive is stored. Rasterize the dense artist only, keeping text and axes vector, and size figures to their destination width so labels are not shrunk by later downscaling. For rasterization, physical size, and out-of-range colour handling, read [references/export-density-and-size.md](references/export-density-and-size.md).
- Preserve intended dimensions: avoid `bbox_inches='tight'` when exact page size matters. Do not combine `tight_layout()` with constrained layout.
- Do not claim that converting PNG to PDF creates vector art or that upsampling adds information.
- Check the actual delivered files for clipping, overlaps, line/marker visibility, axis units, legend identity, colorbar limits, panel ordering, and readability at final size. Inspect PDF rendering when PDF is the deliverable; a PNG preview alone does not verify it. Follow the available PDF-reading workflow for that check.
- Plotting libraries do not report layout defects: text that overflows its axes, escapes an annotated region, or collides with other text raises nothing and is only visible on inspection. Where a figure is regenerated by script, measure rendered text extents before saving and fail the script on violations, so a defect cannot be committed unseen. Read [references/layout-verification.md](references/layout-verification.md) when adding this check. Geometry checks cover placement only. Assess encoding, accessibility, and scientific correctness separately, and view the delivered figure.
- Confirm data/transformations and interval definitions, not just aesthetics. Compare plotted values to the source and inspect warnings.
- For web outputs, provide alt text or a longer description and an appropriate data alternative.
- Deliver figure paths, source-code path, caption, provenance location, checks completed, and unresolved limitations. Automated checks are not scientific validation or journal acceptance.
