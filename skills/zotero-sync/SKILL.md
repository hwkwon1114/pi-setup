---
name: zotero-sync
description: "Synchronize a curated literature manifest with Zotero through the Zotero Web API: match existing papers, import verified bibliographic metadata, attach validated PDFs, and preserve item mappings for repeatable updates. Use when asked to sync papers or PDFs to Zotero, preview an import, or update Zotero after literature acquisition. Requires a project-supplied configuration file naming the target library, manifest, metadata, state, PDF root, and a private API key file; no account, collection, or corpus is bundled."
---

# Zotero synchronization

Keep bibliography identity, attachment availability, and reading/appraisal status separate. A missing PDF must not prevent creation of a bibliographic record. An uploaded PDF is not a fully read paper.

## Entry points

- `preview`: inspect inputs and run a read-only synchronization preview.
- `sync`: inspect inputs, preview, then perform and verify the authorized synchronization.
- `status`: read the saved mappings and remote collection; report available records, attachments, and unresolved errors without importing anything.

Infer the mode from the request; “sync these papers” authorizes synchronization of the established scope. Do not ask for confirmation of a known configured personal-library target. Ask only when the destination or upload scope has materially different privacy/sharing implications and cannot be resolved from the existing configuration.

## Resolve the backend and scope

The backend is bundled with this skill at `scripts/sync-zotero.py`, resolved relative to this skill's own directory, and runs under Python 3 (standard library only). Resolve project inputs relative to the project being worked on, not the shell's current directory. Inspect the existing configuration and state before executing. Do not invent commands, endpoints, plugins, options, or credentials.

Use Python 3.9+ on macOS, Linux, or WSL: the backend requires POSIX file locking and fails explicitly if it is unavailable.

The backend has **no built-in account, collection, corpus, or path defaults**. Every run is driven by one project configuration file passed with `--config`; the only flags are `--config <path>` (required) and `--dry-run`. It uses the Zotero Web API and a personal collection; Zotero desktop receives changes through normal account sync. Local desktop write support is not required.

The configuration file is JSON and must contain exactly these eight keys, all required, all string values; unknown keys are rejected:

| Key | Meaning |
|---|---|
| `user_id` | Numeric Zotero user ID of the target personal library |
| `collection` | Target collection key in that library |
| `manifest` | Path to the curated `library-manifest.json` |
| `metadata` | Path to the prepared `zotero-metadata.json` |
| `state` | Path to the generated sync-state file (its parent directory must exist) |
| `pdf_root` | Existing directory that manifest `local_path` values are relative to |
| `tag_prefix` | Workflow tag namespace this run owns, e.g. `workflow:<project-slug>`; no whitespace, no trailing colon |
| `key_file` | Path to the private API-key file, outside the repository |

Absolute paths are honoured; otherwise paths resolve relative to the configuration file's own directory, and `~` expands. `manifest`, `metadata`, and `key_file` must already exist and `pdf_root` must be a directory, so a misconfigured run fails before touching the library. A different corpus, account, or collection means a different configuration file — never repoint an existing project's configuration to another account or reuse another project's state file.

Project inputs:

- `library-manifest.json`: `records` with unique stable `id`, valid `canonical_id`, identity URLs, and optional `local_path`/`sha256`. Only canonical records are imported; aliases share their canonical item. PDF paths must be relative to and resolve inside `pdf_root`; absolute paths and symlink/traversal escapes are rejected. Supplied PDFs require matching SHA-256. All local inputs are checked before network calls; validated PDF bytes are held in memory for upload, so use bounded batches for large corpora.
- `zotero-metadata.json`: `records` containing canonical `id` and verified Zotero editable item `data`; provenance stays outside `data`. Coverage must exactly match the canonical manifest records.
- the configured `state` file: generated and maintained by the backend, mapping canonical IDs to remote item/attachment keys, hashes, and errors. Preserve this file across runs; it is project state, never distributed with the skill.

New canonical papers require metadata preparation before sync. Retrieve reliable metadata from primary publisher/DOI/arXiv sources or the verified paper; follow the target item type's Zotero schema. Never invent authors, dates, publication fields, or a preprint-to-journal relationship. Preserve established version distinctions and uncertainty. Do not substitute supplements for full papers.

## Credentials and permission boundary

The backend reads the API key from the configured `key_file` (for example `~/.config/zotero/api-key`). Never print the key, place it in chat, pass it in a URL, put it in a repository or package file, or expose it in logs. If the file is missing, have the user create a dedicated key and save it privately; do not ask them to paste it into chat. Recommend file mode 0600.

Verify the key belongs to the account owning the configured `user_id` and has personal-library read/write, notes, and file access. Do not grant or use group-library access for this personal-library workflow. Do not overwrite credentials or silently switch accounts. Consult official API docs if capabilities differ from the installed backend.

Uploading uses Zotero-managed stored attachments: copies leave the local machine and enter the user's online library. Preserve local originals. A collection is not a substitute for checking whether the destination library is private or shared.

## Execute

Preview first, from the project root, naming the project's configuration:

```bash
python3 <path to this skill>/scripts/sync-zotero.py --config <project>/zotero-sync.config.json --dry-run
```

Inspect the preview for unexpected scope, duplicate matches, missing mapped items, metadata coverage failures, or changed PDF hashes. Resolve identity ambiguity before importing; do not delete state or remove duplicates merely to make the command succeed. A preview reads the live library but performs no remote writes, uploads, or state-file saves. It may create a local advisory lock file. It reports planned creates, collection/access-tag updates, and attachment actions; summary created/updated counts are planned counts in preview mode. It is not a complete field-level JSON diff. Actual Zotero item-schema acceptance and storage permissions are not fully validated by a preview.

For an authorized `sync` request, continue without another approval prompt when the preview matches the established scope:

```bash
python3 <path to this skill>/scripts/sync-zotero.py --config <project>/zotero-sync.config.json
```

Wait for the command's result. No fire-and-forget watcher. The backend takes an advisory lock on `<state>.lock` (exclusive for a real sync, shared for `--dry-run`), so a second concurrent run against the same state fails fast instead of racing; do not work around the lock. Keep credentials out of tool output.

The backend checks saved keys first, then workflow markers/identifiers. Conflicting mapped identifiers, ambiguous matches, and reuse of one item by multiple canonical records fail explicitly before parent writes. Title-only candidates require manual identity reconciliation; matching titles alone never authorize a merge. Identifier extraction is heuristic (including modern arXiv IDs), not exhaustive version resolution; inspect and verify identities during metadata preparation. It preserves existing bibliographic fields, notes, and unrelated tags. It updates collection membership and only the access tags under the configured `tag_prefix`. Matching PDFs are reused; missing copies are uploaded and their remote checksums verified. Changed mapped attachments are reported instead of overwritten.

Treat account permissions, storage quota, unavailable metadata, conflicting remote edits, and failed uploads as explicit blockers. Preserve successful mappings and finish reachable records. Never report an empty attachment record as an uploaded PDF or mark a failed batch complete. Do not buy storage, delete user files, or change sharing to bypass a blocker.

## Verify and report

- Check command exit status and its created/updated/uploaded/unchanged/error counts.
- Inspect remote collection coverage against canonical manifest IDs and saved item keys, not raw record counts that include aliases.
- Confirm mapped attachment checksum verification. For initial setup or changes to upload behavior, download a representative uploaded PDF and compare its SHA-256 to the manifest. Follow signed-storage redirects without forwarding the Zotero API key.
- For initial setup or changes to matching/update behavior, run a second real sync and require zero unexpected creates, updates, or uploads. Routine acquisition runs need not repeat every upload experiment.
- Report the collection link, records created/reused, PDFs uploaded/reused, metadata-only papers, and any blockers. State excluded files outside the manifest scope.

Do not modify scientific claims, appraisal/reading statuses, or user annotations as a side effect of synchronization. No automatic commit, push, publication, or group sharing.

## Literature-review handoff

When a literature-review workflow has explicit current or standing authorization covering Zotero writes/uploads to the configured destination, run this skill's `sync` mode after metadata preparation and PDF acquisition. A config file or API key alone is not authorization. Otherwise keep synchronization optional until a configuration file, destination, and credentials exist. Reuse the existing manifest and mappings; never build a second competing paper catalog.

## Prerequisites this skill does not supply

- A Zotero account, its numeric user ID, and a target collection key.
- A private Zotero API key file with personal-library read/write, note, and file access.
- The project's `library-manifest.json`, `zotero-metadata.json`, PDF directory, and configuration file.

No MCP server is required for synchronization; the bundled backend talks directly to the Zotero Web API over HTTPS.

## Local regression checks and limits

Run `python3 scripts/test_sync.py` with paths resolved relative to this skill directory. Tests use temporary fixtures, fake credentials and a mocked client; they do not access Zotero. They cover path confinement, duplicate IDs, aliases, checksum snapshots, state-path collisions, conservative matching, lock contention, preview non-mutation, metadata-only repeat-sync idempotence, and redirect refusal.

The local installation has not been live-tested for attachment uploads, account permissions, quota errors, conflict recovery, or comprehensive Zotero schema validation. First real sync requires the verification steps above. HTTP redirects are refused by the backend, including storage uploads; report such a failure rather than weakening credential protection automatically. Standalone read-only download verification may follow signed storage redirects without carrying the API key.

## Official references

- [Web API basics and authentication](https://www.zotero.org/support/dev/web_api/v3/basics)
- [Write requests](https://www.zotero.org/support/dev/web_api/v3/write_requests)
- [Attachment uploads](https://www.zotero.org/support/dev/web_api/v3/file_upload)
- [Stored versus linked attachments](https://www.zotero.org/support/attaching_files)
