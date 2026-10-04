import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { REVIEW_TOOLS, SOURCE, taskHash } from './policy.mjs';
import { checkApiCompatibility } from './compatibility.mjs';

export async function loadSubagentApi(agentDir) {
  const root = path.join(agentDir, 'npm/node_modules/pi-subagents');
  const ceilings = await import(pathToFileURL(path.join(root, 'src/api/capability-ceiling.js')).href);
  try {
    const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
    // Prefer @latest. Check required behavior instead of rejecting a new version number.
    // Discovery is still an internal seam; a removed/moved seam fails closed until adapted.
    const [discovery, delegation] = await Promise.all([
      import(pathToFileURL(path.join(root, 'src/agents/agents.js')).href),
      import(pathToFileURL(path.join(root, 'src/api/delegation.js')).href),
    ]);
    const api = { ...ceilings, ...discovery, ...delegation, root, version };
    api.compatibility = checkApiCompatibility(api);
    return api;
  } catch (error) {
    // Retain the public ceiling seam to close launches when API compatibility fails.
    error.capabilityApi = ceilings; throw error;
  }
}

/** Same public provider projection pi-subagents uses; no account selection or credential writes. */
export function inheritProviders(runtime, registry) {
  for (const id of new Set(registry.getRegisteredProviderIds())) {
    const native = registry.getRegisteredNativeProvider(id);
    const config = native ? undefined : registry.getRegisteredProviderConfig(id);
    if (native) runtime.registerNativeProvider(native);
    else if (config) runtime.registerProvider(id, config);
    else throw new Error(`Cannot inherit configured provider ${id}`);
  }
}

export async function awaitDelegation(events, api, request, signal) {
  if (signal.aborted) throw new Error('Review cancelled before dispatch');
  return new Promise((resolve, reject) => {
    const unsubscribe = events.on(api.SUBAGENT_DELEGATION_RESPONSE_EVENT, reply => {
      if (reply.requestId !== request.requestId || reply.ownerRunId !== request.ownerRunId || reply.nodeId !== request.nodeId) return;
      cleanup(); resolve(reply);
    });
    const abort = () => {
      events.emit(api.SUBAGENT_DELEGATION_CANCEL_EVENT, {
        requestId: request.requestId, ownerRunId: request.ownerRunId, nodeId: request.nodeId,
      });
      cleanup(); reject(new Error('Review cancelled or deadline reached; not approval'));
    };
    const cleanup = () => { unsubscribe(); signal.removeEventListener('abort', abort); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (signal.aborted) abort();
      else events.emit(api.SUBAGENT_DELEGATION_REQUEST_EVENT, request);
    } catch (error) { cleanup(); reject(error); }
  });
}

export function assertNoOwnerSchedules(cwd, agentDir) {
  const file = path.join(agentDir, 'extensions/subagent/config.json');
  const config = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  if (config.scheduledRuns?.enabled === false) return;
  if (config.scheduledRuns?.storeRoot !== undefined || fs.existsSync(path.join(cwd, '.pi/subagents/schedules')))
    throw new Error('Command-owned reviews do not bind projects/custom roots with schedules; otherwise an unrelated due job could launch. Resolve scheduling separately.');
}

/** One command-owned host with a separate bus/identity. The main ceiling NEVER opens. */
export async function runOwnedReview({ sdk, api, agentDir, agent, task, timeoutMs, toolCalls, ctx, signal }) {
  // Do not bypass another extension's plan-mode/capability restriction by making a new host.
  for (const id of [ctx.sessionManager.getSessionId(), ctx.sessionManager.getSessionFile()].filter(Boolean)) {
    const current = api.resolveCurrentSubagentCapabilityCeiling(id);
    if (current?.sources.some(source => source !== SOURCE))
      throw new Error('Another capability policy is active; resolve it before /review-change');
  }
  if (signal.aborted) throw new Error('Review cancelled');
  assertNoOwnerSchedules(ctx.cwd, agentDir);
  const base = path.join(agentDir, 'review-change-runs');
  fs.mkdirSync(base, { recursive: true, mode: 0o700 });
  const dir = fs.mkdtempSync(path.join(base, 'review-')); fs.chmodSync(dir, 0o700);
  const reportPath = path.join(dir, 'report.md');
  const write = (name, data) => fs.writeFileSync(path.join(dir, name), data, { mode: 0o600 });
  write('task.md', task + '\n');
  const controller = new AbortController();
  const relay = () => controller.abort(); signal.addEventListener('abort', relay, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(relay, timeoutMs); timer.unref?.();
  const check = () => { if (controller.signal.aborted) throw new Error('Review cancelled or deadline reached'); };
  let owner, restriction, terminal;
  const extensionErrors = [];
  try {
    const catalog = path.join(agentDir, 'models-store.json');
    if (fs.existsSync(catalog)) {
      fs.copyFileSync(catalog, path.join(dir, 'models-store.json')); fs.chmodSync(path.join(dir, 'models-store.json'), 0o600);
    }
    const runtime = await sdk.ModelRuntime.create({
      authPath: path.join(agentDir, 'auth.json'), modelsPath: path.join(agentDir, 'models.json'),
      modelsStorePath: path.join(dir, 'models-store.json'), allowModelNetwork: false, refreshOnCreate: false,
    });
    check(); inheritProviders(runtime, ctx.modelRegistry);
    await runtime.refresh({ allowNetwork: false }); check();
    const events = sdk.createEventBus();
    const settingsManager = sdk.SettingsManager.inMemory({
      packages: [], retry: { enabled: false }, compaction: { enabled: false },
      cacheWarming: 'off', enabledModels: [],
    });
    const manager = sdk.SessionManager.inMemory(ctx.cwd);
    restriction = api.registerSubagentCapabilityCeiling({
      sessionId: manager.getSessionId(), source: 'explicit-code-review-command',
      ceiling: { allowedAgents: [agent], allowedTools: REVIEW_TOOLS },
    });
    const loader = new sdk.DefaultResourceLoader({
      cwd: ctx.cwd, agentDir, settingsManager, eventBus: events,
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      additionalExtensionPaths: [path.join(api.root, 'index.js')],
    });
    await loader.reload(); check();
    if (loader.getExtensions().errors.length) throw new Error(JSON.stringify(loader.getExtensions().errors));
    const created = await sdk.createAgentSession({
      cwd: ctx.cwd, agentDir, modelRuntime: runtime, model: ctx.model || undefined,
      resourceLoader: loader, settingsManager, sessionManager: manager, noTools: 'all',
    });
    owner = created.session; check();
    await owner.bindExtensions({ onError: error => extensionErrors.push(String(error.error || error)) });
    if (extensionErrors.length) throw new Error(extensionErrors.join('\n')); check();
    const request = {
      requestId: randomUUID(), ownerRunId: randomUUID(), nodeId: 'explicit-review',
      agent, task, cwd: ctx.cwd, context: 'fresh', timeoutMs,
      toolBudget: { hard: toolCalls, block: '*' }, artifacts: true,
      intercomBridge: { mode: 'off' }, result: { kind: 'text' },
    };
    write('request.json', JSON.stringify({ ...request, taskSha256: taskHash(task), packageVersion: api.version, apiCompatibility: api.compatibility }, null, 2) + '\n');
    terminal = await awaitDelegation(events, api, request, controller.signal);
    check();
    if (terminal.status === 'completed' && !terminal.result)
      throw new Error('Completed reviewer returned no result; not approval');
  } catch (error) {
    terminal = { status: controller.signal.aborted ? 'cancelled' : 'failed', error: error.message };
  } finally {
    clearTimeout(timer); signal.removeEventListener('abort', relay);
    // Abort active owned work before releasing the admission ceiling.
    if (owner) {
      await owner.abort().catch(() => {});
      try { await owner.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }); }
      catch (error) { terminal = { ...terminal, status: 'failed', priorStatus: terminal?.status, cleanupError: error.message }; }
      finally { owner.dispose(); }
    }
    restriction?.dispose();
  }
  write('result.json', JSON.stringify(terminal, null, 2) + '\n');
  write('report.md', `# Explicit code review\n\nAgent: ${agent}\nStatus: ${terminal.status}\nModel: ${terminal.model || '(unavailable)'}\nTask SHA-256: ${taskHash(task)}\n\n${terminal.result?.kind === 'text' ? terminal.result.text : terminal.error || 'No textual result.'}\n\nA completed run is not an approval verdict or execution authorization.\n`);
  return { status: terminal.status, reportPath, resultPath: path.join(dir, 'result.json'), model: terminal.model, usage: terminal.usage };
}
