# Notebooks for understanding and investigation

Notebooks may explain a concept, specify a protocol, develop a method, construct a counterexample, or analyze results. These are roles, not a requirement to create three notebooks per question.

## Teach while coding

Use intuition → assumptions → equations → a small worked example → implementation → interpretation/limits when helpful. Define symbols and explain tensor dimensions, dtype/device choices, random state, transformations, and numerical checks. Adjust depth to the reader; do not turn every maintenance response into a lecture.

Label synthetic demonstrations, recorded experimental results, conjectures, and derivations distinctly. Connect an example to a specific issue in the literature, without claiming it reproduces a paper unless the protocol actually does. Leave unavailable derivation or proof steps explicit.

## Preserve working notebooks

Inspect cells, metadata, outputs, execution counts, and imports before editing. Preserve cell IDs where present, user content, meaningful outputs, and ordering. Avoid wholesale rewrites and generated copies per setting. Keep reusable implementation in project modules when repeated use warrants it, while retaining enough explanatory code to connect equations to computation.

Execution counts do not prove reproducibility; saved outputs can be stale. Record source/data/configuration identity when possible. Restart-and-run-all is a deliberate execution test, not an automatic prerequisite to editing or publishing; obtain appropriate approval for its cost and side effects. State when it was not performed.

## Show selected portions in the research site

Use a narrative sequence: question and paper context → selected explanation/code → recorded figure/table → interpretation → full evidence link. Select by stable cell IDs, labels, or an explicit cell-selection manifest where possible, not fragile unexplained positions. Preserve the notebook version/hash and record which cells/outputs were shown.

A small static extraction is acceptable when the renderer's notebook-embedding feature is unavailable or untested. Disclose that it is an excerpt and how to refresh it. Do not maintain a second hand-copied scientific implementation or silently regenerate output from changed inputs.

Inspect rich HTML/JavaScript outputs before including them. Retain necessary warnings, uncertainty definitions, and negative outcomes; hiding debugging noise is not permission to hide scientific failures. Provide the complete notebook or an approved artifact reference when suitable.

Publishing saved outputs must not launch experiments. Link downloadable notebooks by default until scoped excerpt/render support is reviewed. Check the installed Quarto version's documentation before using embedding options, and test that no kernel or fit runs during publishing.

## Interpretation checklist

Explain what the output answers, what the comparison holds fixed, and what it cannot establish. A plot of low loss is not evidence of parameter recovery; a successful toy example is not a general theorem. Keep analysis of existing outputs distinct from new model fitting, even if both happen in notebooks.
