import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { checkApiCompatibility, COMPATIBILITY_CONTRACT } from './compatibility.mjs';
import { loadSubagentApi } from './runner.mjs';

const home = process.env.PI_REVIEW_GATE_REAL_AGENT_DIR || path.join(os.homedir(), '.pi/agent');
const available = fs.existsSync(path.join(home, 'npm/node_modules/pi-subagents/package.json'));
const installed = available ? await loadSubagentApi(home) : undefined;
const registrySize = () => globalThis[Symbol.for(installed.SUBAGENT_CAPABILITY_CEILING_REGISTRY_KEY)]?.size || 0;

test('installed latest API passes a no-provider, registry-only compatibility probe', { skip: !available }, () => {
  const before = registrySize();
  assert.deepEqual(checkApiCompatibility(installed), { contract: COMPATIBILITY_CONTRACT, probe: 'passed' });
  assert.equal(registrySize(), before);
});
test('loader accepts an arbitrary future version with the same contract; no version allowlist', { skip: !available }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-future-api-'));
  try {
    const packageRoot = path.join(root, 'npm/node_modules/pi-subagents');
    fs.mkdirSync(path.join(packageRoot, 'src/api'), { recursive: true });
    fs.mkdirSync(path.join(packageRoot, 'src/agents'), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ type: 'module', version: '99.0.0' }));
    for (const file of ['src/api/capability-ceiling.js', 'src/api/delegation.js', 'src/agents/agents.js'])
      fs.writeFileSync(path.join(packageRoot, file), `export * from ${JSON.stringify(pathToFileURL(path.join(installed.root, file)).href)};\n`);
    const future = await loadSubagentApi(root);
    assert.equal(future.version, '99.0.0'); assert.equal(future.compatibility.probe, 'passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
for (const field of ['discoverAgents', 'resolveCurrentSubagentCapabilityCeiling', 'SUBAGENT_DELEGATION_CANCEL_EVENT'])
  test(`missing ${field} fails compatibility instead of relaxing policy`, { skip: !available }, () => {
    const before = registrySize();
    assert.throws(() => checkApiCompatibility({ ...installed, [field]: undefined }));
    assert.equal(registrySize(), before);
  });
test('changed intersection behavior fails and disposes probe registrations', { skip: !available }, () => {
  const before = registrySize();
  const bad = { ...installed, resolveCurrentSubagentCapabilityCeiling(id) {
    const result = installed.resolveCurrentSubagentCapabilityCeiling(id);
    return result ? { ...result, allowedAgents: ['worker', 'reviewer'] } : result;
  } };
  assert.throws(() => checkApiCompatibility(bad)); assert.equal(registrySize(), before);
});
test('broken loader retains usable ceiling API for package-level fail-closed policy', { skip: !available }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-broken-api-'));
  try {
    const packageRoot = path.join(root, 'npm/node_modules/pi-subagents');
    fs.mkdirSync(path.join(packageRoot, 'src/api'), { recursive: true });
    fs.mkdirSync(path.join(packageRoot, 'src/agents'), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ type: 'module', version: '99.0.0' }));
    fs.writeFileSync(path.join(packageRoot, 'src/api/capability-ceiling.js'), `export * from ${JSON.stringify(pathToFileURL(path.join(installed.root, 'src/api/capability-ceiling.js')).href)};\n`);
    fs.writeFileSync(path.join(packageRoot, 'src/api/delegation.js'), 'export const incompatible = true;\n');
    fs.writeFileSync(path.join(packageRoot, 'src/agents/agents.js'), 'export const incompatible = true;\n');
    await assert.rejects(loadSubagentApi(root), error => {
      assert.equal(typeof error.capabilityApi.registerSubagentCapabilityCeiling, 'function');
      return /Missing compatible API/.test(error.message);
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
