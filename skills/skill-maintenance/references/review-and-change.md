# Review, stage, test, install

## Inventory and provenance

Record source location, reviewed commit/hash, installed version and ownership. Check symlinks and package/dotfile management: the live file shows behavior, but edits may belong in its manager's source. Keep upstream-managed package caches unchanged. Offer a maintained local delta or upstream contribution instead; publishing requires separate permission.

For a new skill, examine related skills first. Record reused methodology, new shared improvements and deliberate differences. Prefer specific task triggers to broad 'every tool call' triggers. Keep the core small; references should name the condition that requires reading them. Do not require a fixed line count when it harms clarity.

## Staging

Use a unique operation directory under `~/.pi/agent/skill-maintenance/staging/`, with a complete skill subdirectory whose name matches its frontmatter. Never stage under a skills discovery directory. Use timestamp plus UUID or another collision-resistant name, not date alone. Refuse existing destinations.

For existing skills, capture a fresh baseline inventory of relative paths and hashes, copy the full approved bundle, and verify the copy before editing. Exclude caches deliberately and document exclusions. Inspect symlinks; do not silently follow them into private directories. If an earlier pending proposal exists, compare baseline/live/proposal before choosing a base. Modification time alone does not establish semantic freshness or a 'superset'.

Keep a change report outside the staged skill with rationale, baseline hashes, per-file changes, tests and approval state. Prefer targeted edits. Preserve attribution and explain modifications to adapted material. No forced ZIP packaging for a local Pi directory installation; inspect complete contents when packaging for distribution.

## Validation layers

1. **Format:** frontmatter parses using a real available YAML parser or Pi's own loader; validate name/description types and actual parsed description length (1024-character standard limit), not regex reconstruction. Do not install a parser without permission. If full parsing is unavailable, report that limitation rather than a full pass. Pi permits directory/name differences, although matching them is our portability convention.
2. **Bundle:** resolve declared local references recursively, including Markdown links and command script paths, not just backticked paths. Classify examples/globs explicitly. Flag missing files, absolute machine-specific paths, escaping paths and symlinks for review. Check secrets, unexpected executables, dependencies and generated junk. A lexical scanner alone cannot prove completeness.
3. **Behavior:** run safe representative examples and boundary/error cases in isolated temporary destinations, with explicit timeouts. Test documented commands after substituting placeholders, from a clean shell and unrelated working directory. Record exact commands, versions, environment and outputs. A guard passes only if the intended guard caused rejection.
4. **Regression:** repeat the case that motivated the change. For restructures, inventory preserved rules and check lost/added behavior as well as textual differences. Verify changed dependencies and shared rules across siblings.
5. **Activation:** `/reload` refreshes Pi resources, but helper tests do not prove natural skill selection. Test selection in a fresh session separately; distinguish an explicit `/skill:name` invocation from unprompted activation. No claim of automatic monitoring without tested integration.

Tests should themselves include known-good and known-bad fixtures. If measuring numerical accuracy or performance, use matched inputs/configurations and state sample size and timing boundaries. Do not equate parse success with equation fidelity, table correctness, or source agreement.

## Approval and install

Review-only and staging-only requests stop at the report. An approved install covers only the named changes, not unrelated sibling updates, package installs, model downloads, hooks, or configuration edits.

Before an authorized install: compare live files to recorded baseline; stop and reconcile if they changed. For new skills refuse a name collision. Keep a backup outside discovery paths. Apply the approved bundle, verify file content afterward, and retain rollback information. Do not claim atomic multi-file installation unless the implementation actually guarantees it. Do not roll back over later edits automatically.

Per-target state is explicit: proposed → staged → installed → activation verified. A rejected or blocked target retains its own state; do not mark a multi-skill change complete because one member succeeded. Installation checks and behavior checks are separate evidence.

## Review output

Report the reviewed scope, actionable findings with evidence, recommended disposition, changes actually made, exact stage/install paths, test coverage, limitations and next action. Keep large provenance/test logs outside SKILL.md. Prune rules lacking value, but do not delete historical evidence or old stages without authorization.
