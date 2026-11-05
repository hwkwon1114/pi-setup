# Current research state (dashboard)

One screen, newest first: the lab extension injects only the first 6000 characters every turn.
Rules: `DECISIONS.md` (short list; full rows in `DECISIONS_LOG.md`, which win). Specs/results: `cards/` (each card's
`Status:`/`Stage:` lines are current). Move superseded dashboard text verbatim to a `RESEARCH_HISTORY_<date>.md`.

## Objective

<One paragraph; full statement in `AGENTS.md`.>

## Now ({{DATE}})

- Project created with `/lab-init`. Next: fill in the objective in `AGENTS.md`, review `.pi/lab.json`, draft the
  first card from `cards/TEMPLATE.md`.

## Results so far (detail in cards)

- (none yet)

## Open decisions (DECISIONS.md)

(none)

## Cards

| Card | Status |
|---|---|

## Standing constraints (summary; authority in AGENTS.md and DECISIONS.md)

GPU jobs via `job_start` only (policy `.pi/lab.json`). Outputs go to Git-ignored `outputs/`. No deletions, new
dependencies or test-set use for selection without the researcher.
