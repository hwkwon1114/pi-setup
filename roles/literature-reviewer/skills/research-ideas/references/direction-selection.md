# Direction selection and frontier checks

Read for direction selection, novelty/nearest-work challenges, or frontier/citation-momentum requests. Choose routes for the decision, not to fill a checklist. Narrow diagnostics may omit unrelated routes with reasons.

## Route map

| Question | Route | Interpretation limit |
|---|---|---|
| What addresses the target? | Paired Consensus/FastTrack searches; independent terminology | Discovery is not evidence verification |
| What is near a known paper? | `recommend_similar` using verified DOI/OpenAlex seeds | Similarity is not a citation edge |
| What already answers the candidate? | `run_duplication_test` plus independent Consensus search | Inspect closest leads; the tool's label is not a verdict |
| What is gaining attention? | Relevant papers' `counts_by_year` from search/`get_paper` | Attention is not truth, feasibility or novelty |
| What assumptions organize the debate? | `map_topic_debate`, recent papers and `common_ancestors` | Shared references do not establish opposing positions |
| Is a candidate gap filling? | `check_gap_saturation` plus directly answering papers | Query-dependent counts do not establish a gap |
| Where might it be submitted? | `get_journal_profile` only when publication strategy is requested | Venue metrics are not paper quality |

Broad direction reviews normally use paired discovery, seeded neighbors once seeds exist, momentum screening and topic mapping. Apply duplication/saturation to serious candidates, not every vague idea. Record missing access, quotas or prerequisites. Citation chains and primary preprint/proceedings records complement these non-exhaustive connectors. Before tool calls, follow [protocol.md](protocol.md).

Support method trends with dated papers and competing explanations; small clusters are leads, not consensus. Check relevant registrations for review-track duplication; these connectors alone do not establish systematic-review coverage.

## Citation momentum

Use a relevance-screened pool including new/uncited work and closest competitors—not a citation threshold. Save provider/date, exact paper/version, publication age and raw annual counts.

For retrieval year Y, compare C(Y−1) with C(Y−2), preferably with a longer trajectory. Keep Y year-to-date separate; do not annualize it automatically. A ratio is meaningful only with a positive baseline. An omitted year is unknown unless the provider defines it as zero. New papers may have insufficient history, not stagnant attention.

Compare similar-age papers where useful; keep foundations separate. Do not sum providers or merge version series without verified identity and compatible coverage. Small counts, indexing/backfill and changing queries can dominate apparent growth. Report attention *within the inspected pool*, not a field-wide ranking. One snapshot supports retrospective description, not ongoing monitoring.

## Decision memo

For each serious candidate, reuse the dossier or [evidence card](evidence-card.md) to connect:

**Target/change → verified closest-work difference → supporting and opposing evidence → actual feasibility → smallest discriminating test and kill criterion.**

State unresolved assumptions, access and data/compute/method prerequisites. Label deductions/proposals; unknown resources remain unknown. Distinguish incompatible targets or assumptions from genuinely conflicting findings. A proof obligation, counterexample or source analysis may be the right test; do not force an experiment onto every field.

Compare the shortlist by scientific importance, nearest-work overlap, attention/saturation context, feasibility and strongest objection. Recommend pursue/refine/defer/reject with reasons; do not manufacture an aggregate score or choose for the researcher. If plausible closest work is unread, novelty remains unresolved. Bound any absence claim to the searches and inspected sources as of a stated date.

## Actual route ledger

Maintain this with the first meaningful synthesis, not after long appendices:

| Route / decision question | Query or seed IDs | Executed / blocked / intentionally omitted | Finding | Limitation or reason |
|---|---|---|---|---|

Reuse query/paper IDs and keep raw responses/trajectory snapshots with existing records. Reconcile child evidence against sources; multiple agents finding one work do not add independent support. Shared account quotas and the host's integration reserve still apply.
