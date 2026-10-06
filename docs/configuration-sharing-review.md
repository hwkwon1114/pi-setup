# Configuration layering integration — 2026-10-05

Researcher approved GitHub's current approach except machine configuration sharing, then authorized shared defaults/private overrides and integration of the other GitHub changes.

## Applied

- Fast-forwarded local main from `36bdbad` to GitHub `d7a431d` (three commits). Adopted removal of review-gate/legacy multi-openai, consolidated Codex helpers/account-email status, literature dynamic-MCP tool fix and model settings. No local minimal-footer patch reapplied: researcher explicitly accepted current GitHub approach except configuration sharing.
- Preintegration work preserved in Git stash `preserve local setup before approved GitHub integration` and private `/home/pxl1051/pi-setup-backup.2rsRBF/` (full source archive, patch and resolved live configuration). No credentials were copied, changed or uploaded. Backup contains local source/configuration; do not publish it.
- Replaced upstream settings-copy-only sync with settings/models/MCP composition from portable defaults and private `local-config/` JSON Merge Patches. Local UI edits refuse synchronization until explicitly captured. Export never copies live JSON. Private paths/device state are not automatically promoted to shared defaults.
- Current machine's three JSON symlinks converted to owner-only regular files, shared values verified equal to GitHub defaults, old machine bookkeeping retained privately. Resource/instruction links unchanged. Local pull/rebase hooks installed; no unrelated hooks replaced. No installs, commits, pushes or scientific jobs.

## Verification

- Eight Python fixtures cover OS path strings/spaces, nested merges, replacement arrays, deletion, shared updates, machine keys, refusal before partial changes, explicit capture of actual UI edits, malformed inputs, dry check, symlink detachment/backups, initial migration and export privacy.
- Initial suite: 45 passed/1 failed because the test used Python 3.7's `capture_output` on this host's Python 3.6. Replaced it with `stdout/stderr=PIPE`; application behavior unchanged.
- Final repository suite: **46 checks passed, zero failures** (includes new eight-fixture Python check and upstream extension/SDK fixtures). `git diff --check` and live `sync-settings.sh --check` passed. Logs retained privately at `/home/pxl1051/pi-setup-backup.2rsRBF/tests-final.log`; preceding failed run retained in `tests.log`.
- Linux execution only; Windows/macOS path strings tested, native platform operation not verified. No independent review, live provider/MCP authentication check, or interactive restart was run. The merge algorithm does not supply a cross-file transaction/process lock; avoid concurrent Pi settings edits/syncs. Shared resource source may still contain user-authored secrets; explicit review remains necessary before publication.

Restart Pi to unload removed extensions and activate the GitHub provider layout. Do not pop the old stash wholesale over this integrated layout.

## Publication preparation — 2026-10-06

- Researcher authorized committing the configuration-layering changes to clean the checkout. Upstream `a016a43` (autonomous experiment workflow instructions) was fast-forwarded first without overwriting local edits.
- Reran the offline repository suite: **46 checks passed, zero failures**. Log retained locally at `/tmp/pi-setup-tests-publish.log`. Configuration validation and `git diff --check` passed.
- Publication includes only portable source, tests and documentation; private overrides, credentials, backups and the historical stash remain local. Platform/live-session and independent-review limits above remain unchanged.
