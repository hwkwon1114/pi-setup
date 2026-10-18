---
name: editable-concept-diagrams
version: 1.0.0
description: Create simple conceptual illustrations and research-vision diagrams directly in native editable SVG or through image-generated exploration followed by an SVG rebuild. Use for pictorial schematics, slide concepts, and requests to match an existing illustration's style. Not for quantitative plots, scientific image analysis, or raster images merely wrapped in SVG.
compatibility: Uses an existing SVG renderer for visual verification; image-generation capability is needed only for generated exploration. Install dependencies only after explicit approval.
metadata:
  author: "Hyunwoo Kwon <hwkwkon1114@gmail.com>"
  tags:
    - diagrams
    - svg
    - visualization
    - concept-design
---

# Editable concept diagrams

Draft straightforward diagrams directly in SVG. Use generated images when requested or when pictorial exploration helps, then rebuild the useful design with editable vector elements. A generated image is a visual draft, not evidence or an automatically editable source.

## Purpose

Design clean, editable conceptual illustrations and architecture diagrams using the simplest suitable route: direct SVG or image-assisted exploration.

## Prerequisites

- For image-assisted exploration only: access to an image-generation capability (e.g. `generate_image`).
- An SVG rendering utility (e.g., `resvg`, `inkscape`, or browser-based rendering) to generate PNG previews for visual inspection.

## 1. Establish meaning and style

- Identify the message, intended medium, and essential entities and relationships. Distinguish a proposed vision from demonstrated results.
- If the user names a reference illustration, locate and read it; inspect its rendered appearance when possible. Borrow its visual language, not unrelated subject matter. Ask only for information that blocks a truthful diagram.
- Default to an illustration-led design: white background, large recognizable objects, short headings, restrained colors, generous whitespace, and only essential arrows. Prefer two or three visual ideas over a dense boxed flowchart. Supporting bullets belong outside the artwork.
- Preserve necessary distinctions despite simplifying: sensing versus actuation, planning versus execution, learning versus deployment, evaluation versus feedback. An arrow must have an intelligible direction and meaning.
- Quantitative plots belong to scientific-visualization instead. For mixed figures, keep data panels reproducible and separate from generated conceptual artwork; never generate apparent measurements or simulation results.

## 2. Choose direct SVG or a generated visual draft

- For a straightforward diagram, proceed directly to SVG. When the user asks for image generation, use the available image-generation tool; otherwise use it only when exploration adds value. It can establish composition, pictorial motifs, and palette. Request short labels and simple flat-vector styling.
- Include only the conceptual information needed by the tool. Do not upload private reference files or other private content without explicit permission; a style description may suffice.
- Save the generated original and record its prompt, actual path, and model if reported. Inspect the result: generated text, machine geometry, and arrow directions are not authoritative.
- If the user already chose a generated draft, reuse it. Do not generate again merely to satisfy this sequence. Otherwise proceed with the strongest initial draft unless a consequential ambiguity needs the user's choice; avoid unrequested variant sprawl.
- If optional generation fails, report the limitation and proceed directly in SVG when it satisfies the request. If generated imagery itself is required, report the blocker rather than silently substituting. Do not describe a hand-drawn SVG as image-generated.

## 3. Rebuild as native SVG

- Reconstruct the useful composition using paths, basic shapes, groups, and markers. Keep labels as editable SVG text and use broadly available fonts. Name semantic groups so objects are easy to select and move.
- Do not embed the generated raster and call it editable. Do not blindly trace it into thousands of meaningless contours or convert labels to outlines by default. Disclose any explicitly requested raster exceptions.
- Preserve the selected visual style while correcting erroneous labels, misleading relationships, and implausible geometry. Record substantive simplifications rather than silently losing the user's meaning.
- Use a deliberate viewBox/aspect ratio, consistent strokes and arrowheads, and sufficient room for labels. Add a title and description for accessibility and conceptual qualifications.
- Keep the file self-contained: no external fonts/images, scripts, or remote resources. Never silently overwrite an earlier design; use a distinct revision unless replacement was requested.

## 4. Verify the delivered artifact

- Parse SVG XML and check dimensions/viewBox, local ID references, editable text, and absence of unintended raster content or external resources. These are structural checks, not proof of visual quality or full editor compatibility.
- Render the actual SVG with an available local renderer to a PNG preview and open that preview. Check clipping, overlaps, label readability at intended display size, arrow endpoints, contrast, and recognizable objects. Compare it with the chosen visual draft and the user's reference.
- Independently check meaning against the request: no invented causal arrows, no implied numerical evidence, and no unsupported claims of successful control or validated physics.
- Fix defects and render again. If rendering is unavailable, deliver with visual verification explicitly pending; do not claim that XML parsing constitutes visual inspection. Report editor round-trip compatibility as untested unless actually checked.

## 5. Deliver and preserve

- Keep the editable SVG, rendered preview, and, when used, generated original together or cross-reference their real paths. Reuse an existing project note for provenance. The note records the prompt, draft used, substantive changes, checks performed, and remaining limits; it stays outside the artwork.
- Provide concise opening instructions appropriate to the environment; in a remote VS Code terminal offer a copyable `code /absolute/path/to/diagram.svg` command after checking the file exists.
- Describe the output as direct SVG or a native SVG reconstruction, as actually produced—not exact automated vectorization. No extra installation, configuration changes, publication, or experiments are implied by this workflow.

## Examples

Illustrative image-generation **prompt**, not executable Python; pass it to the available image tool using that tool's actual input format:
```text
Clean flat-vector scientific schematic of a digital twin pipeline: physical sensor on left, neural operator in center, parameter estimation feedback loop on right, generous whitespace, minimalist pastel palette.
```
For a style-match request, first inspect the permitted reference and describe its palette, spacing and pictorial motifs in the prompt; preserve the user's entities and relationships rather than copying unrelated content from the reference.

Constructing structured SVG layout:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" width="800" height="400">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#333"/>
    </marker>
  </defs>
  <g id="physical-system">
    <rect x="50" y="150" width="180" height="100" rx="8" fill="#e8f4f8" stroke="#2b6cb0" stroke-width="2"/>
    <text x="140" y="205" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="bold">Physical Sensor</text>
  </g>
</svg>
```

## Limitations

- Vector reconstruction is manual/semi-automated semantic rebuild, not an automated bitmap-to-vector tracing pipeline.
- Not suited for quantitative or empirical data plots; use `scientific-visualization` for data-driven plots.
- External fonts and raster images are excluded to keep SVGs fully self-contained.

## Troubleshooting

| Error / Issue | Cause | Solution |
|---|---|---|
| `Label text clipped or overlapping` | Bounding box insufficient for rendered font metrics | Increase group padding or adjust `font-size` / `viewBox` coordinates |
| `SVG XML parse error` | Unclosed tags or unescaped characters in text elements | Validate well-formedness with XML parser before visual rendering |
| `Image generation failure` | Tool or provider unavailable | Proceed directly in SVG if generation was optional; otherwise report the unmet requirement |
| `Missing local SVG renderer` | `resvg` or `inkscape` not installed on host | Provide copyable file path and request browser/VS Code visual review |
