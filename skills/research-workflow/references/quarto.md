# Quarto as the reading layer

## Start from the argument

Build a small reading path: foundations → literature → research question → investigation → findings → evidence. Give each investigation one entry point. Raw tables and provenance support the explanation; they are not a substitute for it. Not every project needs a website or every possible page.

Quarto renders existing content; it does not establish novelty, maintain scientific state automatically, or prove historical lineage. Keep machine-readable bookkeeping generated from authoritative records and human-readable interpretation linked to snapshots. Identify who owns source updates and whether copied reviews or notebook excerpts are stale.

## Configure only supported features

Check Quarto availability/version and OS compatibility. Read official documentation for the specific feature before using it:

- https://quarto.org/docs/websites/website-basics.html
- https://quarto.org/docs/projects/code-execution.html
- https://quarto.org/docs/authoring/notebook-embed.html

The notebook-embedding reference is a discovery pointer, not a claim its options were tested. Do not install Quarto or LaTeX without approval; a Linux cluster may require a permitted user-space install or rendering elsewhere. HTML avoids requiring a PDF/LaTeX toolchain.

## Publishing must not execute investigations

Use an explicit allowlist of render targets and disable execution with project configuration `execute: {enabled: false}`. Inspect document-level overrides, executable cells, extensions, includes, and pre/post-render hooks before running a build. Static QMD pages and approved notebook downloads are a conservative starting point.

`freeze` is caching, not an execution prohibition: incremental renders can still execute code. Execution settings do not neutralize arbitrary hooks. Do not add experiment commands as render hooks or pass execution-enabling flags. Keep indexing saved records separate from the scientific runner.

Before rendering existing notebook outputs or excerpts, inspect the notebook and confirm the mechanism will not start a kernel or recompute outputs. State when only source preparation, not rendering, has been completed.

## Equations, citations, and links

Explain notation and assumptions around rendered equations. Cross-reference stable identifiers rather than hard-coded numbering. Keep figures concise and explanations in captions or surrounding text.

Preserve source-access labels when republishing reviews. Link teaching summaries to the full source and bibliography. Do not turn metadata-only leads into verified results. Retain derivation, inference, proposal, and reported-result distinctions.

Use explicit resource allowlists, relative site links, and source/version hashes. Links outside the rendered site tree may fail when served. Copy only approved artifacts; avoid recursive inclusion of private corpora, secrets, or unrelated outputs. A source-at-import hash does not establish that source generated an older result.

Check rendered anchors, not only Markdown links: heading IDs differ between GitHub and Quarto. JSON Pointers identify records but are not automatically navigable browser links. Escape data-derived HTML/Markdown and inspect embedded rich outputs before trusting them.

## Verify the delivered site

- Parse configuration with an available YAML parser; inspect render targets and hooks.
- Render without scientific execution and check source/artifact preservation.
- Check local links, fragments, includes, downloads, and copied-resource hashes.
- Visually inspect equations, tables, figures, citations, navigation, and layout at useful sizes. Math parsing is not equation-fidelity verification.
- Exercise search, filters, and cross-page links in a browser; retain a static/CSV alternative for interactive tables.
- Test network-dependent math/fonts/assets separately. A localhost site may still load CDNs; do not claim offline support without checking.
- Use localhost for preview. Stop temporary validation servers; do not start a persistent service or public deployment without appropriate scope.

Record source prepared, render completed, browser interaction tested, visual checks performed, and offline/platform support separately. Preserve test failures and their corrections. A working Mac site does not establish Quest/Vision compatibility or accessibility certification.
