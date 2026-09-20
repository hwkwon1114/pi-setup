# Layout verification

Read this when a figure is produced by a script that will be re-run, when labels sit
inside shaded regions or insets, or when a reviewer reports overlapping or clipped text.

Matplotlib places text where it is told and reports nothing when the result is wrong.
Overflowing an axes, spilling out of a shaded band, and colliding with another label all
export cleanly and fail silently. Visual review catches these, but only for the figure
version someone actually opened; the next regeneration with new data can reintroduce them.
Where the figure is scripted, make the placement contract machine-checkable.

## What to check

- **Text inside its axes.** Compare each text artist's window extent to the axes bbox.
- **Text inside its annotated region.** A band label belongs within the band it names, not
  merely within the axes.
- **Text against text.** Intersecting extents of visible labels.
- **Decision rule.** Fail the generating script on violations rather than printing a
  warning that scrolls past, so a defective figure is not saved unnoticed.

These are geometric facts. They say nothing about whether the encoding is appropriate,
the palette is distinguishable, or the numbers are right.

## Measuring

Extents require a renderer, so draw first and measure after the layout engine has run. Use
a small tolerance for sub-pixel font hinting.

```python
from matplotlib.transforms import Bbox

TOL_PX = 1.0


def _extent(fig, artist):
    fig.canvas.draw()
    return artist.get_window_extent(renderer=fig.canvas.get_renderer())


def audit_text_layout(fig, *, tol_px=TOL_PX):
    """Return (kind, detail) for text leaving its axes or overlapping other text."""
    findings = []
    for index, ax in enumerate(fig.get_axes()):
        name = ax.get_label() or f"axes[{index}]"
        box = _extent(fig, ax)
        visible = [t for t in ax.texts if t.get_visible() and t.get_text().strip()]
        for text in visible:
            bb = _extent(fig, text)
            dx = max(box.x0 - bb.x0, bb.x1 - box.x1)
            dy = max(box.y0 - bb.y0, bb.y1 - box.y1)
            if dx > tol_px or dy > tol_px:
                findings.append(("text-outside-axes", f"{name}: {text.get_text()!r}"))
        for i in range(len(visible)):
            for j in range(i + 1, len(visible)):
                hit = Bbox.intersection(_extent(fig, visible[i]), _extent(fig, visible[j]))
                if hit is not None and hit.width > tol_px and hit.height > tol_px:
                    findings.append(("text-overlap", f"{name}: {visible[i].get_text()!r}"))
    return findings
```

Call it immediately before export and stop on failure:

```python
problems = audit_text_layout(fig)
if problems:
    raise AssertionError("layout defects: " + "; ".join(k for k, _ in problems))
fig.savefig(target)
```

Legends, titles, tick labels, and offset text are not in `ax.texts`; extend the collection
deliberately if those matter, and expect axis labels to sit outside the axes box by design.

## Sizing a region to its label

Preferred over shrink-to-fit when the label carries meaning. Convert the rendered text
width into data units and widen the region. The data-to-pixel scale depends on the axis
limits, which depend on the region width, so iterate until it stops changing.

```python
def required_span_width(fig, ax, artist, pad_px=12.0):
    bb = _extent(fig, artist)
    inv = ax.transData.inverted()
    return abs(inv.transform((bb.width + 2 * pad_px, 0))[0] - inv.transform((0, 0))[0])
```

If a region genuinely cannot grow, shorten or wrap the text, or move it out with a leader
line. If shrink-to-fit is used anyway, set a font floor and warn when the floor is reached,
so an unfittable label is reported instead of silently rendered unreadably small.

## Testing the check

A check that only ever passes is not evidence. Exercise it on a fixture with known defects
— a label wider than its band, text placed beyond the axis limits, two labels at the same
coordinates — and confirm each is reported, then confirm a clean figure reports nothing.
Re-run the case that originally motivated the check.
