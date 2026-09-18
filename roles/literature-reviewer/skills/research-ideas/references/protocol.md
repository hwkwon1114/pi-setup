# Retrieval and record protocol

Read before literature-tool calls or creating structured ledgers. Reuse the project's formats; the fields below are a fallback, not a requirement to create every file.

## Tool access

The host supplies Consensus (`https://mcp.consensus.app/mcp`) and FastTrack (`https://literature.researchfasttrack.com/mcp`). Discover mounted tools and inspect their current schemas; names/options vary by host and account. In Pi, use the `mcp` gateway to inspect/connect the named server, not imagined flattened APIs. Cached tools or metadata do not prove a live search succeeded.

| Purpose | Capability | Key input |
|---|---|---|
| Question-oriented discovery | Consensus `search` | `query`; authorized date filters only |
| Lexical discovery | FastTrack `search_papers` | `query`; dates/limit/page per schema |
| Metadata/version resolution | FastTrack `get_paper` | DOI/OpenAlex `id` |
| Seed neighborhood | FastTrack `recommend_similar` | Verified `ids`; not a forward-citation list |
| Closest competitors | FastTrack `run_duplication_test` | `question`, applicable `mode` |
| Topic/reference clusters | FastTrack `map_topic_debate` | `topic` |
| Publication-count signal | FastTrack `check_gap_saturation` | `gap_statement` |
| Requested venue context | FastTrack `get_journal_profile` | `journal`; not paper-quality evidence |

Use only routes needed for the assigned decision. Broad discovery uses both providers; focused deepening need not refresh either. Single-source/blocked/omitted coverage must remain explicit.

### Filters, failures and attribution

- Consensus general searches use only `query` unless the request authorizes filters. A latest-work request permits a declared recent window, not arbitrary study-design/citation/open-access restrictions. Pagination and excerpt options must follow the actual schema/account; excerpts are partial access. Consensus pages start at 0, FastTrack at 1.
- Share provider quotas across children. Consensus batches are at most three searches; serialize/designate one owner when needed. On rate limit, wait 30 seconds or the longer server-requested delay only if budget permits; otherwise report the blocker. Do not repeatedly retry a 401.
- Authentication/transport failure is not an empty search. Save completed work and name the unavailable route and recovery action. In a headless role, hand auth back to the coordinator. `/mcp-auth consensus` is an interactive Pi command, never a shell command; if the main adapter is absent, request an explicitly authorized adapter-enabled interactive session. Do not change configuration or read/print tokens yourself.
- Preserve exact returned URLs and per-call result-number mappings; numbers restart on each call. Disambiguate query IDs and map them to stable bibliography IDs. For presented Consensus findings, retain its required result citations/metadata and reproduce actual signup/upgrade/usage notices verbatim at the end; invent none. Link presented FastTrack paper titles to returned URLs.
- After each batch, inspect relevance and requested dates/types. Log and repair empty/off-field/narrow queries: shorten terms, disambiguate, use relevant primary titles and alternate disciplinary vocabulary. Boolean syntax, quotes and reported totals may behave differently across engines. Result totals are not screened-study counts.

### Search dates and expansion

Do not date-filter a general survey silently. Updates distinguish all-year coverage repair from frontier refresh. For requested latest work with no documented cutoff, declare the previous two calendar years through today as a default recent window, alongside all-year foundations. With a known cutoff, overlap the preceding calendar year for indexing/version changes. A user-specified window takes precedence; the review's modification date is not its search cutoff.

Check primary preprint/venue/proceedings records when indexing may lag; retain publication/version/status disagreements. Keep relevant new/uncited and paywalled leads rather than equating citation count or accessibility with quality. Use backward references and available forward-citation sources without inventing unsupported APIs.

## Records

Persist actual requests, reading and decisions incrementally. Small tasks/pilots may consolidate them in one useful note; a smoke test must not claim a full review. Use raw response files when available and safe, without credentials or unnecessary private material.

- **`dossier.md`:** contract, actual scope/coverage, cross-paper synthesis, claim delta, candidates/next decision and status (`partial`, `blocked`, `complete_within_scope`).
- **`searches.jsonl`** (append-only): `id`, `run_id`, actual `executed_at`, `provider`, `tool`, `family`, `question_ids`, exact `arguments`, effective query if changed, `status`, returned count/estimated total, `raw_path`, relevance notes, `repair_of`, `next_action`. Status distinguishes `ok`, `auth_error`, `rate_limited`, `transport_error`, `tool_error`. Preserve notices/result mappings. Planned searches are not executed rows.
- **`papers.jsonl`** (one current record/work): stable ID, verified identifiers, title/authors, version aliases and dates, discovery/query/rank provenance, screening decision/reason, actual access/locators/limits, evidence type and optional citation count/provider/date. Use `include`, `exclude`, `uncertain`; missing abstracts remain unknown. Keep counterevidence. Update rather than duplicate records; rewrite atomically.
- **`evidence.md`:** stable claim ID/text/type, baseline location, paper/version/inspected locator, assumptions/limits, claim disposition and research consequence. Reuse the [evidence card](evidence-card.md) when it helps; an existing claim table need not be replaced.

Normalize DOI case/resolver prefixes for matching, but preserve returned URLs for citations. Match DOI first, then verified repository/version IDs; without IDs, title/authors/year only propose a match for manual checking. Do not merge renamed/preprint/journal versions without supporting metadata or count them as independent evidence.

Access labels: `metadata_only`, `abstract_only`, `partial_full_text`, `full_text_inspected`. They describe actual inspection, not download/extraction success or scientific quality. Retain exact version and inspected sections/pages. For updates preserve old wording and dated reasons; separate newly published work, older omissions, revisions/improved access and unknown temporal relationships.

If reporting coverage counts, deduplicate verified works, retain source overlap and exclusions, and distinguish returned/screened/included items. Do not turn database coverage or provider rank into a quality score. Follow any host artifact-manifest/filename-ownership contract; existing files and valid schemas do not establish valid claims.
