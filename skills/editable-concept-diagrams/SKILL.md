---
name: editable-concept-diagrams
description: Create simple conceptual illustrations and research-vision diagrams through image generation followed by a native editable SVG rebuild. Use for pictorial schematics, slide concepts, and requests to match an existing illustration's style. Not for quantitative plots, scientific image analysis, or raster images merely wrapped in SVG.
compatibility: Requires an available image-generation tool for concept exploration and an existing SVG renderer for visual verification. Install dependencies only after explicit approval.
---

# Editable concept diagrams

Use generated images to explore composition, then rebuild the useful design with editable vector elements. The image is a visual draft, not evidence or an automatically editable source.

## 1. Establish meaning and style

- Identify the message, intended medium, and essential entities and relationships. Distinguish a proposed vision from demonstrated results.
- If the user names a reference illustration, locate and read it; inspect its rendered appearance when possible. Borrow its visual language, not unrelated subject matter. Ask only for information that blocks a truthful diagram.
- Default to an illustration-led design: white background, large recognizable objects, short headings, restrained colors, generous whitespace, and only essential arrows. Prefer two or three visual ideas over a dense boxed flowchart. Supporting bullets belong outside the artwork.
- Preserve necessary distinctions despite simplifying: sensing versus actuation, planning versus execution, learning versus deployment, evaluation versus feedback. An arrow must have an intelligible direction and meaning.
- Quantitative plots belong to scientific-visualization instead. For mixed figures, keep data panels reproducible and separate from generated conceptual artwork; never generate apparent measurements or simulation results.

## 2. Generate a visual draft

- Use the available image-generation tool to establish composition, pictorial motifs, and palette. Request short labels and simple flat-vector styling.
- Include only the conceptual information needed by the tool. Do not upload private reference files or other private content without explicit permission; a style description may suffice.
- Save the generated original and record its prompt, actual path, and model if reported. Inspect the result: generated text, machine geometry, and arrow directions are not authoritative.
- If the user already chose a generated draft, reuse it. Do not generate again merely to satisfy this sequence. Otherwise proceed with the strongest initial draft unless a consequential ambiguity needs the user's choice; avoid unrequested variant sprawl.
- If generation is unavailable or fails, report the blocker and ask whether to proceed directly in SVG. Do not describe a hand-drawn SVG as image-generated.

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

- Keep the generated original, editable SVG, rendered preview, and a short provenance note together or cross-reference their real paths. The note records the prompt, draft used, substantive changes, checks performed, and remaining limits; it stays outside the artwork.
- Provide concise opening instructions appropriate to the environment; in a remote VS Code terminal offer a copyable `code /absolute/path/to/diagram.svg` command after checking the file exists.
- Describe the output as a native SVG reconstruction, not exact automated vectorization. No extra installation, configuration changes, publication, or experiments are implied by this workflow.
