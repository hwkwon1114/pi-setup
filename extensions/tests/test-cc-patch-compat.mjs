// Offline fixture for cc-patch-compat (coding-agent path alias). Run: node --test tests/test-cc-patch-compat.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, lstatSync, chmodSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { hostJiti } from '../../tests/lib/pi-host.mjs';
const jiti = hostJiti(import.meta.url);
const m = await jiti.import(new URL('../cc-patch-compat.ts', import.meta.url).pathname);

test('links coding-agent to pi-coding-agent once, next to the package', () => {
  const t = mkdtempSync(join(tmpdir(), 'ccpc-'));
  const scope = join(t, 'node_modules', '@earendil-works'), pkg = join(scope, 'pi-coding-agent');
  mkdirSync(join(pkg, 'docs'), { recursive: true }); writeFileSync(join(pkg, 'README.md'), 'readme');
  try {
    assert.equal(m.ensureCodingAgentAlias(pkg), 'created');
    assert.ok(lstatSync(join(scope, 'coding-agent')).isSymbolicLink());
    assert.equal(readFileSync(join(scope, 'coding-agent', 'README.md'), 'utf8'), 'readme');
    assert.ok(existsSync(join(scope, 'coding-agent', 'docs')));
    assert.equal(m.ensureCodingAgentAlias(pkg), 'exists');
    assert.equal(m.ensureCodingAgentAlias(join(t, 'elsewhere')), 'skipped');
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test('acts only when settings.json lists pi-cc-patch', () => {
  const a = mkdtempSync(join(tmpdir(), 'ccpc-agent-'));
  const set = (packages) => writeFileSync(join(a, 'settings.json'), JSON.stringify({ packages }));
  try {
    assert.equal(m.ccPatchConfigured(a), false);
    set(['npm:pi-subagents@latest']); assert.equal(m.ccPatchConfigured(a), false);
    set(['git:github.com/picassio/pi-cc-patch']); assert.equal(m.ccPatchConfigured(a), true);
    set([{ source: 'git:github.com/picassio/pi-cc-patch@fe58871' }]); assert.equal(m.ccPatchConfigured(a), true);
    writeFileSync(join(a, 'settings.json'), '{'); assert.equal(m.ccPatchConfigured(a), false);
  } finally { rmSync(a, { recursive: true, force: true }); }
});

test('session_start links once, notifies, and never throws', async () => {
  const t = mkdtempSync(join(tmpdir(), 'ccpc-ss-'));
  const scope = join(t, 'nm', '@earendil-works'), pkg = join(scope, 'pi-coding-agent'), agent = join(t, 'agent');
  mkdirSync(pkg, { recursive: true }); mkdirSync(agent);
  writeFileSync(join(agent, 'settings.json'), JSON.stringify({ packages: ['git:github.com/picassio/pi-cc-patch'] }));
  const saved = { a: process.env.PI_CODING_AGENT_DIR, p: process.env.PI_PACKAGE_DIR };
  process.env.PI_CODING_AGENT_DIR = agent; process.env.PI_PACKAGE_DIR = pkg;
  const h = {}; m.default({ on: (e, f) => (h[e] ??= []).push(f) });
  const notes = []; const ctx = { hasUI: true, ui: { notify: (msg, lvl) => notes.push([lvl, msg]) } };
  try {
    await h.session_start[0]({}, ctx);
    assert.ok(lstatSync(join(scope, 'coding-agent')).isSymbolicLink()); assert.deepEqual(notes.map(n => n[0]), ['info']);
    await h.session_start[0]({}, ctx); assert.equal(notes.length, 1, 'no-op when the link exists');
    if (process.platform !== 'win32' && process.getuid?.() !== 0) {
      rmSync(join(scope, 'coding-agent')); chmodSync(scope, 0o555);
      try { await h.session_start[0]({}, ctx); } finally { chmodSync(scope, 0o755); }
      assert.equal(notes.at(-1)[0], 'warning', 'read-only install: warning, no throw');
    }
  } finally {
    for (const [k, v] of [['PI_CODING_AGENT_DIR', saved.a], ['PI_PACKAGE_DIR', saved.p]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    rmSync(t, { recursive: true, force: true });
  }
});
