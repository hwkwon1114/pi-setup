# Shared defaults and private machine overrides

Git tracks `config/settings.json`, `config/models.json`, `config/mcp.json` as portable defaults. Pi reads generated regular files with those names in its agent home; Pi itself does not load these overrides. Run `bin/sync-settings.sh` to compose them. No plugin or package installation is required; Python 3 and the existing Bash scripts are used (Git Bash on Windows).

## Machine configuration

Create `<agent-home>/local-config/settings.json`, for example:

```json
{
  "shellPath": "C:\\Program Files\\Git\\bin\\bash.exe",
  "externalEditor": "code --wait",
  "subagents": {
    "defaultSubagentOnlyExtensions": ["C:/Users/you/.pi/agent/extensions/multi-codex/index.ts"]
  }
}
```

On macOS/Linux choose that machine's paths instead. The sync script does not interpolate environment variables or translate paths. Resource paths retain Pi's native agent-home-relative semantics. Local arrays replace shared arrays in full (including packages, tools and model lists); review them when shared defaults change.

For MCP tools with OS-specific executables, use `local-config/mcp.json`:

```json
{
  "mcpServers": {
    "local-tool": {
      "command": "/absolute/path/to/tool",
      "args": ["--serve"]
    }
  }
}
```

`local-config/models.json` works identically for private endpoints/model overrides. Keep credentials in Pi's auth storage or server-specific supported credential mechanisms, not shared JSON. Overrides may contain sensitive local data and should not be committed or uploaded. Shared instructions must likewise avoid machine-specific cluster rules; keep those in project/machine-local instruction files.

## Merge, changes and recovery

- JSON Merge Patch semantics: objects merge recursively, scalars/arrays replace, `null` removes keys. Literal JSON null cannot be set through an override. To remove an inherited list use `[]`.
- Private explicit overrides win even if shared defaults change later. Remove a private override to inherit again. `deviceId` and `lastChangelogVersion` are carried from live settings automatically, never from shared defaults.
- `.last-applied.json` inside `local-config/` records the last rendered files; it is local state, not a shared template. It may include local secrets. Each JSON output is atomically replaced with owner-only permissions on POSIX; replaced live configurations are backed up under `backups/config-*/`.
- Unrecorded live edits block all three files before any configuration is written. Run `bin/sync-settings.sh --capture-local` to preserve these edits privately. With a saved baseline, only actual edits are captured, allowing unrelated new shared defaults through. On the first migration there is no baseline: capture preserves the complete existing live meaning, including deletions. Inspect/remove unwanted overrides afterward.
- `--check` validates inputs and conflict status without writing; it is not a preview of values. Invalid JSON or unavailable Python refuses synchronization. There is no force-overwrite mode.
- A crash during separate file replacements is not a cross-file transaction: backups survive and a subsequent conflict requires inspection/capture. Do not run sync concurrently with Pi settings edits or a second sync. A last-applied state write is also atomic but no process-wide locking is claimed.
- Existing JSON symlinks are replaced, never written through; shared source stays intact. Existing source/link values are snapshotted as resolved JSON before replacement. Git hooks report refusal rather than silently overwriting live edits. Missing resource links are repaired by the installer, not synchronization.

## Sharing changes

Edit portable `config/*.json`, test, then commit/push only reviewed source files. `bin/export.sh` deliberately skips all three live JSON files and the local override directory; it does not attempt heuristic secret/path scrubbing. Local Pi/UI changes are private unless you explicitly promote them. Check resource/instruction exports as usual.

Full `install.sh --link` installs Git synchronization hooks without replacing unrelated existing hooks. With copies or resource-only links, run synchronization explicitly after pulling. Reload Pi for configuration changes; restart after provider/extension removals. No configuration is sent to GitHub automatically.

Native Windows/macOS execution has not been verified by the Linux fixtures; they test Windows/macOS/Linux path strings and spaces, not those operating systems' shells, permissions or executable availability.
