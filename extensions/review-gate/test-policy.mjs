import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installReviewGate, isCodeReviewer, parseReview, SOURCE } from './policy.mjs';
import { assertNoOwnerSchedules, awaitDelegation, inheritProviders, runOwnedReview } from './runner.mjs';

function fixture(overrides = {}) {
  const handlers = new Map(), commands = new Map(), registry = new Map(), entries = [], messages = [], notices = [];
  const catalog = [{ name: 'worker' }, { name: 'scout' }, { name: 'reviewer' }, { name: 'astra-code-reviewer' },
    { name: 'literature-reviewer' }, { name: 'pkg:reviewer', localName: 'reviewer', aliases: ['alias'] }];
  const api = {
    discoverAgents: () => ({ agents: catalog }),
    registerSubagentCapabilityCeiling({ sessionId, source, ceiling }) {
      const item = { sessionId, source, ceiling }; registry.set(item, item);
      return { update(next) { item.ceiling = next; }, dispose() { registry.delete(item); } };
    },
  };
  const pi = {
    on: (name, fn) => handlers.set(name, fn), registerCommand: (name, command) => commands.set(name, command),
    appendEntry: (...args) => entries.push(args), sendMessage: (...args) => messages.push(args),
  };
  let sessionId = 'memory-id', file = '/tmp/persisted-session.jsonl';
  const ctx = { cwd: '/tmp/project', model: { provider: 'faux' },
    sessionManager: { getSessionId: () => sessionId, getSessionFile: () => file },
    ui: { setStatus() {}, notify: (...args) => notices.push(args) }, waitForIdle: async () => {},
  };
  let calls = 0;
  const gate = installReviewGate(pi, {
    loadApi: overrides.loadApi || (async () => api),
    runReview: overrides.runReview || (async request => {
      calls++; assert(!request.signal.aborted);
      return { status: 'completed', reportPath: '/tmp/report.md' };
    }),
  });
  return { handlers, commands, registry, catalog, entries, messages, notices, ctx, gate, api,
    get calls() { return calls; },
    start: () => handlers.get('session_start')({}, ctx),
    call: input => handlers.get('tool_call')({ toolName: 'subagent', input }, ctx),
    change: () => { sessionId = 'next-id'; file = '/tmp/next-session.jsonl'; },
  };
}

test('identity classification excludes literature and leaves worker/oracle delegation intact', () => {
  for (const name of ['reviewer', 'astra-code-reviewer', 'evidence-auditor', 'project-code-reviewer']) assert(isCodeReviewer({ name }));
  for (const name of ['worker', 'oracle', 'literature-reviewer', 'literature-coordinator']) assert(!isCodeReviewer({ name }));
  assert(isCodeReviewer({ name: 'pkg:reviewer', localName: 'reviewer' }));
});
test('bounded command syntax uses fixed ordinary/safety agents, never a model-supplied permission', () => {
  assert.equal(parseReview('Inspect /tmp/code.py').agent, 'reviewer');
  assert.equal(parseReview('--safety Inspect /tmp/protocol.md').agent, 'astra-code-reviewer');
  for (const args of ['', ' ', '--safety', 'x'.repeat(60001)]) assert.throws(() => parseReview(args));
});
test('ceilings cover BOTH persisted and in-memory identities, aliases, opaque workflows; no automatic run', async () => {
  const f = fixture(); await f.start();
  assert.equal(f.registry.size, 2);
  for (const item of f.registry.values()) {
    assert.equal(item.source, SOURCE);
    assert.deepEqual(item.ceiling.allowedAgents, ['worker', 'scout', 'literature-reviewer']);
  }
  assert.equal(f.call({ agent: 'reviewer', approved: true, userRequested: true }).block, true);
  assert.equal(f.call({ agent: 'worker' }), undefined);
  // Opaque workflows pass the frontend but receive the same package-owned ceiling.
  assert.equal(f.call({ workflow: './opaque-script.js' }), undefined);
  assert.equal(f.calls, 0); assert.equal(f.messages.length, 0);
});
test('explicit command dispatches once and NEVER opens the main ceiling or triggers a model turn', async () => {
  const f = fixture(); await f.start();
  await f.commands.get('review-change').handler('Review the supplied slice', f.ctx);
  assert.equal(f.calls, 1);
  assert.equal(f.entries.length, 2);
  assert.deepEqual(f.messages[0][1], { triggerTurn: false });
  for (const item of f.registry.values()) assert(!item.ceiling.allowedAgents.includes('reviewer'));
  assert.equal(f.call({ agent: 'reviewer' }).block, true);
});
test('invalid request and concurrent command never dispatch extra work', async () => {
  let release, calls = 0;
  const f = fixture({ runReview: async () => { calls++; return await new Promise(resolve => { release = resolve; }); } });
  await f.start();
  await f.commands.get('review-change').handler('', f.ctx); assert.equal(calls, 0);
  const pending = f.commands.get('review-change').handler('Review task', f.ctx);
  await Promise.resolve(); await Promise.resolve();
  await f.commands.get('review-change').handler('Another task', f.ctx);
  assert.equal(calls, 1); assert.equal(f.call({ workflow: './opaque.js' }).block, true);
  release({ status: 'completed', reportPath: '/tmp/report' }); await pending;
});
for (const reason of ['cancel', 'shutdown', 'session-change']) test(`${reason} cancels and prevents stale result delivery`, async () => {
  let request, release;
  const f = fixture({ runReview: async value => { request = value; return await new Promise(resolve => { release = resolve; }); } });
  await f.start();
  const pending = f.commands.get('review-change').handler('Review task', f.ctx);
  await Promise.resolve(); await Promise.resolve();
  if (reason === 'cancel') await f.commands.get('review-cancel').handler('', f.ctx);
  if (reason === 'shutdown') f.handlers.get('session_shutdown')();
  if (reason === 'session-change') { f.change(); f.handlers.get('before_agent_start')({}, f.ctx); }
  assert(request.signal.aborted);
  release({ status: 'completed', reportPath: '/tmp/stale' }); await pending;
  assert.equal(f.messages.length, 0);
  if (reason === 'shutdown') assert.equal(f.registry.size, 0);
});
test('reload cleanup is idempotent and uses no durable approval state', async () => {
  const f = fixture(); await f.start(); await f.start(); assert.equal(f.registry.size, 2);
  f.gate.dispose(); f.gate.dispose(); assert.equal(f.registry.size, 0);
});
test('API failure blocks direct AND nested subagent calls without starting a reviewer', async () => {
  const f = fixture({ loadApi: async () => { throw new Error('missing package'); } }); await f.start();
  assert.match(f.call({ agent: 'reviewer' }).reason, /missing package/);
  assert.equal(f.calls, 0);
});

test('an incompatible API closes package-level launches across session changes, not just the model tool', async () => {
  const f = fixture();
  const api = { registerSubagentCapabilityCeiling({ sessionId, source, ceiling }) {
    const item = { sessionId, source, ceiling }; f.registry.set(item, item);
    return { update(next) { item.ceiling = next; }, dispose() { f.registry.delete(item); } };
  } };
  const handlers = new Map();
  installReviewGate({ on: (name, fn) => handlers.set(name, fn), registerCommand() {} }, {
    loadApi: async () => { const error = new Error('incompatible API'); error.capabilityApi = api; throw error; }, runReview() { assert.fail('must not dispatch'); },
  });
  await handlers.get('session_start')({}, f.ctx);
  assert.equal(f.registry.size, 2);
  for (const item of f.registry.values()) assert.deepEqual(item.ceiling.allowedAgents, []);
  f.change(); handlers.get('before_agent_start')({}, f.ctx);
  assert.equal(f.registry.size, 2);
  assert.deepEqual([...f.registry.values()].map(item => item.sessionId), ['next-id', '/tmp/next-session.jsonl']);
  for (const item of f.registry.values()) assert.deepEqual(item.ceiling.allowedAgents, []);
  handlers.get('session_shutdown')(); assert.equal(f.registry.size, 0);
});
test('failed catalog refresh leaves both package-owned ceilings closed', async () => {
  const f = fixture(); await f.start();
  f.api.discoverAgents = () => { throw new Error('catalog scan failed'); };
  assert.equal(f.call({ agent: 'worker' }).block, true);
  for (const item of f.registry.values()) assert.deepEqual(item.ceiling.allowedAgents, []);
});
test('command cannot bypass another extension capability policy by creating a new host', async () => {
  await assert.rejects(runOwnedReview({ ctx: { sessionManager: { getSessionId: () => 'root', getSessionFile: () => null } },
    api: { resolveCurrentSubagentCapabilityCeiling: () => ({ sources: ['plan-mode'] }) } }), /Another capability policy/);
});

test('command host refuses scheduling roots rather than launching unrelated due jobs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-schedule-check-'));
  try {
    const cwd = path.join(root, 'project'), agentDir = path.join(root, 'agent');
    assertNoOwnerSchedules(cwd, agentDir);
    fs.mkdirSync(path.join(cwd, '.pi/subagents/schedules'), { recursive: true });
    assert.throws(() => assertNoOwnerSchedules(cwd, agentDir), /unrelated due job/);
    fs.mkdirSync(path.join(agentDir, 'extensions/subagent'), { recursive: true });
    const file = path.join(agentDir, 'extensions/subagent/config.json');
    fs.writeFileSync(file, JSON.stringify({ scheduledRuns: { enabled: false } }));
    assertNoOwnerSchedules(cwd, agentDir);
    fs.writeFileSync(file, JSON.stringify({ scheduledRuns: { storeRoot: '/tmp/custom-schedules' } }));
    assert.throws(() => assertNoOwnerSchedules('/tmp/empty-project', agentDir), /unrelated due job/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

function bus() {
  const hooks = new Map();
  return { on(name, fn) { const list = hooks.get(name) || new Set(); list.add(fn); hooks.set(name, list); return () => list.delete(fn); },
    emit(name, value) { for (const fn of [...(hooks.get(name) || [])]) fn(value); },
    count(name) { return hooks.get(name)?.size || 0; } };
}
const eventsApi = { SUBAGENT_DELEGATION_REQUEST_EVENT: 'request', SUBAGENT_DELEGATION_RESPONSE_EVENT: 'response', SUBAGENT_DELEGATION_CANCEL_EVENT: 'cancel' };
const identity = { requestId: 'request-id', ownerRunId: 'owner-id', nodeId: 'node-id' };
test('delegation correlates the ENTIRE attempt tuple and removes listeners', async () => {
  const events = bus(), controller = new AbortController();
  events.on('request', () => {
    events.emit('response', { ...identity, ownerRunId: 'wrong', status: 'completed' });
    events.emit('response', { ...identity, status: 'completed' });
  });
  assert.equal((await awaitDelegation(events, eventsApi, identity, controller.signal)).status, 'completed');
  assert.equal(events.count('response'), 0);
});
test('cancellation targets the exact attempt and does not retry', async () => {
  const events = bus(), controller = new AbortController(); let requests = 0, cancel;
  events.on('request', () => { requests++; controller.abort(); });
  events.on('cancel', value => { cancel = value; });
  await assert.rejects(awaitDelegation(events, eventsApi, identity, controller.signal), /cancelled/);
  assert.deepEqual(cancel, identity); assert.equal(requests, 1); assert.equal(events.count('response'), 0);
});
test('provider inheritance preserves configured IDs; never switches accounts or writes credentials', () => {
  const recorded = [];
  const runtime = { registerNativeProvider: value => recorded.push(value), registerProvider: (...value) => recorded.push(value) };
  const native = { id: 'native' }, config = { opaque: true };
  inheritProviders(runtime, { getRegisteredProviderIds: () => ['native', 'alias'], getRegisteredNativeProvider: id => id === 'native' ? native : undefined,
    getRegisteredProviderConfig: () => config });
  assert.deepEqual(recorded, [native, ['alias', config]]);
});
