import { createHash } from 'node:crypto';

export const SOURCE = 'explicit-code-review';
export const REVIEW_AGENTS = new Set(['reviewer', 'astra-code-reviewer', 'evidence-auditor']);
export const REVIEW_TOOLS = ['read', 'grep', 'find', 'ls', 'bash', 'watchdog_diff'];
export const LIMITS = Object.freeze({ timeoutMs: 600_000, toolCalls: 64 });

// Classify identities, not arbitrary task prose. Literature-review roles are NOT code reviewers.
export function isCodeReviewer(agent) {
  const names = [agent.name, agent.localName, ...(agent.aliases || [])].filter(Boolean);
  return names.some(name => REVIEW_AGENTS.has(name) || /(?:^|[:._-])code[-_]reviewer(?:$|[:._-])/.test(name));
}
export function parseReview(args) {
  const safety = args.trim().startsWith('--safety ');
  const task = (safety ? args.trim().slice('--safety '.length) : args.trim()).trim();
  if (!task || task === '--safety' || Buffer.byteLength(task, 'utf8') > 60_000)
    throw new Error('Usage: /review-change [--safety] <bounded task and source paths> (max 60 KB)');
  return { agent: safety ? 'astra-code-reviewer' : 'reviewer', task, ...LIMITS };
}
export function taskHash(task) {
  return createHash('sha256').update(task).digest('hex');
}

/** Package-owned ceilings enforce launches; this layer owns lifecycle and explicit commands. */
export function installReviewGate(pi, { loadApi, runReview }) {
  let api, fallbackApi, failure, handles = [], identity, generation = 0, active;
  const close = () => { for (const handle of handles) handle.dispose(); handles = []; identity = undefined; };
  const cancel = () => { active?.controller.abort(); };
  const ids = ctx => [...new Set([ctx.sessionManager.getSessionId(), ctx.sessionManager.getSessionFile()].filter(Boolean))];
  function refresh(ctx, cwd = ctx.cwd) {
    const ceilingApi = api || fallbackApi;
    if (!ceilingApi) throw new Error(failure || 'Reviewer gate not initialized');
    const next = ids(ctx).join('\n');
    if (identity !== next) { cancel(); close(); identity = next; generation++; }
    if (!handles.length) {
      // pi-subagents 0.74.0 uses the session FILE for persisted hosts, unlike its ceiling example.
      // Register both identities, including in-memory SDK hosts; never trust a caller-supplied ID.
      try {
        for (const sessionId of ids(ctx)) handles.push(ceilingApi.registerSubagentCapabilityCeiling({
          sessionId, source: SOURCE, ceiling: { allowedAgents: [] },
        }));
      } catch (error) { close(); throw error; }
    }
    // Start closed; an incomplete/failed catalog scan must not leave unrestricted RPC/slash launches.
    for (const handle of handles) handle.update({ allowedAgents: [] });
    if (!api) throw new Error(failure || 'Reviewer gate unavailable');
    const agents = api.discoverAgents(cwd, 'both', ctx.model?.provider).agents;
    const allowedAgents = [...new Set(agents.filter(agent => !isCodeReviewer(agent)).map(agent => agent.name))];
    for (const handle of handles) handle.update({ allowedAgents });
  }
  pi.on('session_start', async (_event, ctx) => {
    cancel(); close(); generation++;
    try {
      api = await loadApi(); fallbackApi = undefined; failure = undefined; refresh(ctx);
      ctx.ui.setStatus('review-gate', 'Code review: explicit /review-change');
    } catch (error) {
      fallbackApi = error.capabilityApi || api || fallbackApi;
      api = undefined; failure = `Reviewer gate unavailable: ${error.message}`;
      if (fallbackApi) { try { refresh(ctx); } catch { /* closed ceilings remain; display original failure */ } }
      ctx.ui.notify(failure, 'error');
    }
  });
  pi.on('before_agent_start', (_event, ctx) => {
    if (api || fallbackApi) {
      try { refresh(ctx); } catch (error) { ctx.ui.notify(error.message, 'error'); }
    }
  });
  pi.on('tool_call', (event, ctx) => {
    if (event.toolName !== 'subagent') return;
    try { refresh(ctx, typeof event.input.cwd === 'string' ? event.input.cwd : ctx.cwd); }
    catch (error) { return { block: true, reason: error.message }; }
    // No caller-controlled permission field, and no model-visible approval tool.
    // Existing workflow snapshots also retain the closed ceiling in child launches.
    if (active) return { block: true, reason: 'A command-owned review is active; wait or use /review-cancel.' };
    const agent = event.input.agent;
    if (typeof agent === 'string' && isCodeReviewer({ name: agent }))
      return { block: true, reason: 'Code review requires an explicit /review-change [--safety] <task> command.' };
  });
  pi.on('session_shutdown', () => { generation++; cancel(); close(); });
  pi.registerCommand('review-change', {
    description: 'Explicitly launch one bounded code reviewer; --safety selects the pre-execution Astra role',
    async handler(args, ctx) {
      let request;
      try { request = parseReview(args); }
      catch (error) { ctx.ui.notify(error.message, 'error'); return; }
      if (active) { ctx.ui.notify('A review is already active; use /review-cancel first.', 'warning'); return; }
      const controller = new AbortController();
      const slot = { controller }; active = slot;
      const startedGeneration = generation;
      try {
        await ctx.waitForIdle();
        if (controller.signal.aborted || startedGeneration !== generation) throw new Error('Review cancelled before launch');
        refresh(ctx);
        const runningGeneration = generation;
        ctx.ui.notify(`Starting ${request.agent}: 10-minute / 64-tool-call cap. No retries by this command.`, 'info');
        pi.appendEntry('review-command', { phase: 'requested', agent: request.agent, taskSha256: taskHash(request.task), cwd: ctx.cwd });
        const outcome = await runReview({ ...request, ctx, signal: controller.signal });
        if (controller.signal.aborted || runningGeneration !== generation) return;
        pi.appendEntry('review-command', { phase: 'finished', agent: request.agent, taskSha256: taskHash(request.task), ...outcome });
        // Findings are saved; no automatic model continuation or follow-up review.
        pi.sendMessage({ customType: 'review-command', content: `${request.agent}: ${outcome.status}\nReport: ${outcome.reportPath}`, display: true }, { triggerTurn: false });
      } catch (error) {
        if (startedGeneration === generation) ctx.ui.notify(`Review incomplete: ${error.message}`, 'error');
      } finally { if (active === slot) active = undefined; }
    },
  });
  pi.registerCommand('review-cancel', {
    description: 'Cancel the active command-owned review; never authorize another review',
    async handler(_args, ctx) { cancel(); ctx.ui.notify(active ? 'Review cancellation requested.' : 'No command-owned review is active.', 'info'); },
  });
  return { refresh, dispose() { generation++; cancel(); close(); } };
}
