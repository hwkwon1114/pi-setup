#!/usr/bin/env bash
# Apply the background-liveness wait patch to pi-goal-x in the local agent home.
# Prevents 3-second autonomous continuation polling loops when subagent reviews are active.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$REPO/bin/common.sh"
DST="$(pi_agent_home)"
GOAL_X_DIR="$DST/npm/node_modules/pi-goal-x"

if [ ! -d "$GOAL_X_DIR/extensions" ]; then
  echo "pi-goal-x not found in $GOAL_X_DIR; skipping patch."
  exit 0
fi

# Copy goal-background-work.ts if missing or changed
if [ -f "$REPO/patches/goal-background-work.ts" ]; then
  cp "$REPO/patches/goal-background-work.ts" "$GOAL_X_DIR/extensions/goal-background-work.ts"
fi

# Apply patch to goal-runtime.ts if not already applied
RUNTIME_FILE="$GOAL_X_DIR/extensions/goal-runtime.ts"
if [ -f "$RUNTIME_FILE" ] && ! grep -q "isBackgroundWorkActive" "$RUNTIME_FILE"; then
  sed -i.bak -e 's/import { networkErrorBackoffPlan/import { isBackgroundWorkActive } from ".\/goal-background-work.ts";\nimport { networkErrorBackoffPlan/' "$RUNTIME_FILE"
  sed -i.bak -e 's/ready = !ctx.hasPendingMessages() && ctx.isIdle();/const backgroundActive = isBackgroundWorkActive(ctx);\n\t\tlet ready: boolean;\n\t\ttry {\n\t\t\tready = !ctx.hasPendingMessages() \&\& ctx.isIdle() \&\& !backgroundActive;\n\t\t} catch {\n\t\t\tif (this.continuationQueuedFor === scheduledGoalId) this.continuationQueuedFor = null;\n\t\t\treturn;\n\t\t}\n\n\t\tif (!ready) {\n\t\t\tthis.continuationScheduledFor = scheduledGoalId;\n\t\t\tconst delay = backgroundActive ? 1000 : CONTINUATION_IDLE_RETRY_MS;\n\t\t\tthis.continuationTimer = setTimeout(() => this.sendQueuedContinuation(ctx, scheduledGoalId), delay);\n\t\t\tthis.continuationTimer.unref?.();\n\t\t\treturn;\n\t\t}/' "$RUNTIME_FILE"
  rm -f "${RUNTIME_FILE}.bak"
  echo "+ patched pi-goal-x goal-runtime.ts (background liveness guard)"
fi

PROMPTS_FILE="$GOAL_X_DIR/extensions/prompts/goal-prompts.ts"
if [ -f "$PROMPTS_FILE" ] && ! grep -q "Asynchronous review/subagent wait" "$PROMPTS_FILE"; then
  sed -i.bak -e '/maxAutonomousRuns in .pi\/pi-goal-x-settings.json/a \  \x27- Asynchronous review/subagent wait: When an async reviewer or subagent is running, keep the goal active; the goal scheduler suppresses autonomous turns while background work is active and resumes upon native wake. Never call update_goal({status: "paused"}) merely to wait for a subagent or reviewer.\x27,' "$PROMPTS_FILE"
  rm -f "${PROMPTS_FILE}.bak"
  echo "+ patched pi-goal-x goal-prompts.ts (lifecycle guidance)"
fi
