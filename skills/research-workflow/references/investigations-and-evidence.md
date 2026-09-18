# Investigations and evidence

## Choose the right kind of inquiry

| Type | Question | Useful evidence |
|---|---|---|
| Replication | Can we reproduce a specified published result? | Versioned protocol, differences from the source, matched outputs and discrepancies |
| Benchmark | How do methods compare under controlled conditions? | Matched information/budgets, paired runs where appropriate, performance and failures |
| Diagnosis | Which explanation accounts for a failure? | Controlled interventions, numerical checks, alternative explanations |
| Method development | Does the proposed change address a defined limitation? | Mechanism-targeted ablations, comparators, negative cases, cost and robustness |
| Theory | Under what assumptions does a statement hold or fail? | Definitions, derivations/proofs, counterexamples, scope and unresolved steps |

Do not require run tables for theory or a new algorithm for a diagnostic study. A numerical example is not a proof. An unsolved issue in this project is not automatically unsolved in the literature.

## Investigation record

Adapt an existing note/schema rather than creating a parallel system. Record:

- Stable ID, question, type, and connection to foundations/papers.
- Hypothesis or target statement, assumptions, competing explanations.
- What would count as progress and what would falsify or limit the approach.
- Protocol/version, varied and fixed factors, budget, independent sampling unit, matching keys, and exclusions.
- Plan versus actual execution; evidence locations.
- Findings, limitations, decisions, and next step.

A status should distinguish planned, active, paused, complete-for-the-declared-scope, and unresolved. Avoid calling an entire question solved because one test passed. Keep manually maintained interpretations separate from automatically generated counts.

## Run and artifact records

Use the existing execution granularity. One fit row is not necessarily one independent replicate or one scheduler job. Preserve:

- Original ID; resolved scientific configuration including defaults.
- Data/split identity and seeds; source revision/hash and uncommitted state when known.
- Actual environment, hardware/device, dtype, and relevant thread settings.
- Execution status, warnings, numerical checks, metric definitions, and artifacts.
- Job/process identity and requested versus actual resources where applicable.

Execution completion, numerical validity, model adequacy, and support for a scientific claim are distinct. Keep failed, interrupted, warning-bearing, and unattempted cases distinguishable; never loosen thresholds to improve pass rates. Missing scores are not zero. Preserve pairing and dependence across reused datasets, seeds, time series, and adaptive sampling. Distinct estimands must retain distinct scores.

## Avoid script and storage sprawl

Settings changes should normally use a shared runner with configuration variants. A different diagnostic procedure may need its own analysis. Distinguish scratch, reusable implementation, investigation, and publication analysis. Do not consolidate or delete files merely because filenames look redundant.

Use unique output roots or explicit immutable snapshots. Reject mismatched resumption and silent overwrites. A forced rerun or artifact deletion is a separate decision. Separate heavy outputs from lightweight manifests; ignored files are not backups. A retention policy must preserve paper-linked evidence and record approval before deletion.

## Indexes and paper provenance

Index saved records without importing scientific modules or executing notebook cells. Validate schema, IDs, finite values where required, missing values, counts, and references. Count equality alone does not prove full factorial coverage. Copy only explicit artifacts and check source stability and hashes. Escape data-derived HTML/Markdown.

For imported arrays, source-file hash plus original row ID and JSON Pointer can identify evidence. A JSON Pointer is not a browser deep link. Stable HTML anchors should be collision-checked; row ID alone cannot identify a changed snapshot.

For each paper figure/table, retain semantic ID, selected runs/rows and snapshot identity, selection/exclusion rules, generating analysis/version, transformations, aggregation, pairing, uncertainty definition, output, caption, and review status. Do not invent these links from a PDF filename. Explain failure-conditioned summaries and selection effects. Keep canonical filenames independent of manuscript numbering.

Test deterministic helpers with known-good, boundary, and bad inputs in isolated destinations, including preservation and overwrite refusal. A successful index or plot is not scientific validation.
