# Export density, physical size, and clipped ranges

Read this when a figure contains dense artists (meshes, large scatters, fields), when the
deliverable has a physical size target, or when a colormap must show out-of-range values.

## Dense artists in vector output

Vector formats store every primitive. A shaded 3D mesh or a large scatter becomes tens of
thousands of path objects, producing files that open slowly, strain typesetting pipelines,
and may be rejected at submission. Resolution is not the problem; primitive count is.

Rasterize only the dense artist and leave text, axes, and annotation vector:

```python
mesh.set_rasterized(True)          # any artist: collection, image, scatter
ax.scatter(x, y, s=2, rasterized=True)
fig.savefig(target, dpi=350)       # dpi governs embedded raster artists
```

Observed effect on a four-panel figure whose first panel is a shaded triangle mesh
(same code, same `dpi=350`, only `set_rasterized(True)` added):

| | PDF size |
| --- | --- |
| fully vector | 2.9–3.0 MB |
| dense mesh rasterized | 604–698 KB |

Confirm after the change that text is still vector — inspect the delivered PDF's font
resources rather than assuming. Rasterizing a whole figure to shrink it destroys selectable
text and scalable line art; rasterize the artist, not the figure. Choose the DPI from the
final printed size of that panel, not a habit value, and treat a rasterized layer as
resolution-fixed evidence: do not enlarge it later.

Layer order matters: with `set_rasterized(True)`, artists below the rasterization boundary
are flattened together. Check that vector overlays (labels, leader lines, limit lines) still
render above the raster.

## Physical size

Set size from the destination, not the default. A figure authored much wider than its final
column is silently downscaled at layout time, shrinking every label and line weight with it,
which is a frequent cause of "the fonts look too small" after export.

- Decide the target width first, then set `figsize` in inches to that width.
- Judge type size and line weight at the final size, not in a zoomed viewer.
- `bbox_inches="tight"` changes the delivered dimensions; avoid it when exact size matters.
- Verify the delivered page dimensions by inspecting the file, since layout options and
  bounding-box trimming alter them after `figsize` is set.

Common print widths are roughly 85–90 mm for a single column and 170–185 mm for a double
column, but exact values, accepted formats, and raster DPI are publisher-, article-, and
stage-specific and change over time. Verify the current official instructions for the actual
target rather than trusting any table, including this paragraph. A figure whose width far
exceeds any plausible column is a design signal regardless of publisher.

## Values outside the colour range

When a colormap is clipped, saturated cells are indistinguishable from in-range extremes.
Make the clipping explicit instead of hiding it:

```python
cmap = plt.get_cmap("viridis").with_extremes(
    over="#B45309", under="#4B5563", bad="#CCCCCC",
)
fig.colorbar(mappable, extend="both")
```

State the limits and the meaning of the over/under/missing colours in the caption. Do not
widen limits purely to avoid the issue when that compresses the informative range, and keep
limits and normalization identical across directly compared panels.

## Log axes

Declare how nonpositive values were handled: dropped, offset, or displayed on a symmetric
log scale with a stated linear threshold. Each choice changes the visual conclusion, and
silently dropping nonpositive values removes observations the reader will assume are shown.
