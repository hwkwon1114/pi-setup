import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export const COMPATIBILITY_CONTRACT = 'review-gate-api-v1';

/** Bounded, synchronous, no-I/O API probe. Never starts a child or calls a provider. */
export function checkApiCompatibility(api) {
  const functions = ['registerSubagentCapabilityCeiling', 'resolveCurrentSubagentCapabilityCeiling',
    'resolveSubagentCapabilityCeiling', 'encodeSubagentCapabilityCeiling', 'decodeSubagentCapabilityCeiling', 'discoverAgents'];
  for (const name of functions) assert.equal(typeof api[name], 'function', `Missing compatible API: ${name}`);
  const events = ['SUBAGENT_DELEGATION_REQUEST_EVENT', 'SUBAGENT_DELEGATION_RESPONSE_EVENT', 'SUBAGENT_DELEGATION_CANCEL_EVENT'];
  for (const name of events) assert(typeof api[name] === 'string' && api[name].length > 0, `Missing delegation event: ${name}`);
  assert.equal(new Set(events.map(name => api[name])).size, 3, 'Delegation event names must be distinct');

  const sessionId = `review-gate-compat-${randomUUID()}`, otherId = `review-gate-compat-${randomUUID()}`;
  const handles = [];
  try {
    assert.equal(api.resolveCurrentSubagentCapabilityCeiling(sessionId), undefined);
    for (const [source, ceiling] of [
      ['probe-a', { allowedAgents: ['worker', 'reviewer'], allowedTools: ['read', 'write'] }],
      ['probe-b', { allowedAgents: ['worker', 'oracle'], allowedTools: ['read', 'ls'], denyExtensions: true }],
    ]) {
      const handle = api.registerSubagentCapabilityCeiling({ sessionId, source, ceiling }); handles.push(handle);
      assert.equal(typeof handle.update, 'function', 'Ceiling update unavailable');
      assert.equal(typeof handle.dispose, 'function', 'Ceiling disposal unavailable');
    }
    const snapshot = api.resolveCurrentSubagentCapabilityCeiling(sessionId);
    assert.deepEqual(snapshot.allowedAgents, ['worker']); assert.deepEqual(snapshot.allowedTools, ['read']);
    assert.equal(snapshot.denyExtensions, true); assert.deepEqual([...snapshot.sources].sort(), ['probe-a', 'probe-b']);
    assert.equal(api.resolveCurrentSubagentCapabilityCeiling(otherId), undefined, 'Ceilings leaked across sessions');
    const inherited = api.decodeSubagentCapabilityCeiling(api.encodeSubagentCapabilityCeiling(snapshot));
    assert.deepEqual(inherited, snapshot, 'Detached snapshot roundtrip changed policy');
    handles[0].update({ allowedAgents: [], allowedTools: [] });
    assert.deepEqual(api.resolveCurrentSubagentCapabilityCeiling(sessionId).allowedAgents, [], 'Empty allowlist must deny all');
    handles[0].dispose();
    assert.deepEqual(api.resolveCurrentSubagentCapabilityCeiling(sessionId).allowedAgents, ['oracle', 'worker']);
    // A wider current registration must not widen an inherited narrow snapshot.
    assert.deepEqual(api.resolveSubagentCapabilityCeiling(sessionId, inherited).allowedAgents, ['worker']);
    handles[1].dispose(); handles[1].dispose();
    assert.equal(api.resolveCurrentSubagentCapabilityCeiling(sessionId), undefined, 'Probe registration leaked');
    assert.deepEqual(api.resolveSubagentCapabilityCeiling(sessionId, inherited), inherited, 'Disposal lost inherited policy');
    return { contract: COMPATIBILITY_CONTRACT, probe: 'passed' };
  } finally {
    for (const handle of handles.reverse()) handle?.dispose?.();
  }
}
