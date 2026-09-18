# Color and entity identity

Use for entity comparisons, colormap selection, and accessibility review. The goal is distinguishable evidence across figures and viewing conditions, not a palette that merely looks attractive. Apply the same policy across application domains; derive entity names and semantics from the project.

## Categorical default

The bundled Matplotlib style uses this five-color subset of the Okabe–Ito palette, in this order:

| Color | Hex | Example redundant cue |
|---|---|---|
| Blue | `#0072B2` | Circle + solid line |
| Vermilion | `#D55E00` | Square + dashed line |
| Bluish green | `#009E73` | Up triangle + dash-dot line |
| Reddish purple | `#CC79A7` | Diamond + dotted line |
| Black | `#000000` | Down triangle + long-dashed line |

The subset deliberately omits the original palette's yellow, orange, and sky blue from the default thin-line cycle because they have lower contrast on white. They are not forbidden, but require context-specific review and suitable boundaries/non-color cues. The five defaults exceed 3:1 sRGB contrast against white, but not all meet text contrast targets and they are not guaranteed to separate pairwise or in grayscale. Keep ordinary text dark; do not use colored text as the only identifier.

Palette provenance: Okabe and Ito, *Color Universal Design*: https://jfly.uni-koeln.de/color/ . This is a local subset/order, not a new palette or an accessibility certification. No network call is required to use the recorded values.

## Stable identities, not color-by-row

1. Identify the semantic dimension being encoded (for example, entity, method, group, or condition). Avoid using the same color channel for different meanings within one comparison.
2. Reuse an existing project mapping if it satisfies readability requirements. If it does not, propose a consistent migration rather than silently recoloring one figure.
3. Record a mapping in project plotting configuration or figure provenance: stable entity ID, display label, exact color, marker, and line style/hatch where relevant. The location follows the project's conventions; no global entity registry is assumed.
4. Apply styles by entity key, not position in a dataframe, order of first appearance, or the subset present in a panel. In Seaborn, supply a palette dictionary and explicit categorical order; supply keyed markers/dashes when appropriate. In Matplotlib, pass the saved styles explicitly.
5. New entities require an explicit assignment. Do not hash names into arbitrary RGB values, recycle an existing identity style, or regenerate all assignments each run. Preserve mappings when an entity is temporarily absent.
6. If a reference/baseline uses black or gray, reserve that neutral role consistently; do not also assign an indistinguishable neutral style to another entity in the same figure.

The style's default color cycle is only a fallback. Matplotlib wraps it after five lines, and it does not preserve identity across different plotting orders. It cannot enforce the mapping policy or add meaningful redundant encodings automatically.

## Match redundant cues to the plot

- **Lines:** use distinguishable dash patterns and/or markers at sensible spacing. Check that dashes remain visible at final size; dotted lines may need thicker strokes. Retain markers for isolated points next to missing-data gaps.
- **Scatter:** use distinct marker shapes and sufficiently visible sizes/edges. Overplotting may require facets, density summaries, or appropriate transparency; lowering alpha alone can erase contrast.
- **Bars/areas:** use hatching and visible boundaries where needed. Do not rely on adjacent fills of similar lightness. Avoid heavy hatching that obscures values or uncertainty.
- **Uncertainty bands:** use the same hue as the corresponding estimate, with a light fill and a legible central line. Overlapping transparent bands mix colors and can become ambiguous; use facets or interval summaries rather than many stacked bands. Define interval semantics in the caption.
- **Legends/direct labels:** show the actual marker, dash, or hatch, with short entity labels. Use direct labels when they clearly attach to the correct marks; do not add long explanations to solve an identity problem.
- **Multiple semantic dimensions:** for example, color can encode entity while dash encodes condition. Do not promise independent non-color identification when all dash patterns have been consumed by another variable; add entity markers, direct labels, or facet one dimension.

## More entities than the palette can carry

Prefer a small number of simultaneously distinguishable traces; five is a default palette size, not a universal perceptual limit. Distinguishability depends on overlap, geometry, mark size and medium.

When the default becomes crowded, use small multiples, separate panels, or explicit labels. If a larger categorical palette is necessary, select and review it as a whole, retain redundant cues, and update the mapping deliberately. Do not extend the palette with progressively similar shades or assume arbitrary color/marker combinations remain readable.

A scientifically justified focal entity may be highlighted against muted context, provided the figure purpose supports it and the caption identifies what is grouped. If the task compares every entity individually, graying all but one or merging categories defeats that purpose. Do not hide entities just to simplify the graphic.

## Continuous values are different

- Use a sequential perceptually ordered map such as `cividis` (preferred starting point for color-vision robustness) or `viridis` for ordered magnitude—not the categorical cycle.
- Use a diverging map for a meaningful center such as signed error about zero. Make the center, normalization, colorbar ticks/units and sign readable; inspect the selected map under the intended viewing conditions. Do not use a red–green-only distinction for sign.
- Use a cyclic map only for genuinely cyclic variables such as phase, with a consistent wrap point.
- Keep the same normalization for directly compared panels. Do not convey a categorical identity by location on a continuous scale.
- Mark missing, masked and out-of-range values explicitly, with an appropriate legend or annotation. A missing-data color must not silently mean a valid numerical value.

## Rendered review

- Inspect at intended final size on the actual background. Check thin strokes, small markers, adjacent fills, transparency, and legend samples—not just large color swatches.
- Check grayscale for loss of entity identity. Similar lightness is common even in colorblind-friendly palettes; redundant cues must do real work.
- When suitable tooling is already available, simulate common red/green deficiencies (protan/deutan) and blue/yellow deficiency (tritan). Do not install tools or transmit private figures without approval. Report checks unavailable rather than claiming they passed.
- Contrast against the background and pairwise category separation are different tests. WCAG web guidance uses 3:1 for graphical objects required for understanding and 4.5:1 for normal text, with applicability/exceptions; these are not universal journal acceptance rules or pairwise color-distance thresholds.
- Simulations are approximations, not proof for every viewer. Seek user feedback when feasible. If identities remain ambiguous, change encoding/layout instead of relying on a palette label.
