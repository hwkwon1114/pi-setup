// Bounded offline fixture: 12 synthetic messages + one call/result, no model calls or delegates.
// Run: node packages/research-runtime/test-context.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Pi host modules: PI_HOST_MODULES, else the newest managed install, else the global npm install.
function piModules() {
  if (process.env.PI_HOST_MODULES) return process.env.PI_HOST_MODULES;
  const home = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent');
  const rel = join(home, 'install', 'releases');
  const versions = existsSync(rel) ? readdirSync(rel).filter(v => existsSync(join(rel, v, 'node_modules', '@earendil-works', 'pi-coding-agent')))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
  if (versions.length) return join(rel, versions.at(-1), 'node_modules');
  return execFileSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
}
const modules = piModules();
const host = join(modules, '@earendil-works/pi-coding-agent');
const hostDep = name => [join(host, 'node_modules', name), join(modules, name)].find(existsSync);
const requireHost = createRequire(join(host, 'package.json'));
const { createJiti } = requireHost('jiti');
const root = mkdtempSync(join(tmpdir(), 'standalone-acp-fixture-'));
process.env.PI_CODING_AGENT_DIR = join(root, 'agent');
process.env.PI_AGENT_HOME = process.env.PI_CODING_AGENT_DIR;
process.env.ACP_LOG_FILE = join(root, 'acp.log');
assert(!process.env.BILLION_CONTEXT_NATIVE && !process.env.BILLION_CONTEXT_PROXY,
  'Run from a fresh shell, not a proxy-owned process');
const sdkPath = join(host, 'dist/index.js');
const jiti = createJiti(import.meta.url, { alias: {
  '@earendil-works/pi-coding-agent': sdkPath,
  '@earendil-works/pi-tui': join(hostDep('@earendil-works/pi-tui'), 'dist/index.js'),
  'typebox': join(hostDep('typebox'), 'build/index.mjs'),
} });
const { SessionManager } = await import(pathToFileURL(sdkPath).href);
const activate = await jiti.import(join(dirname(fileURLToPath(import.meta.url)), 'context.ts'), { default: true });
const handlers = new Map(), tools = new Map();
const pi = {
  on(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); },
  registerTool(tool) { tools.set(tool.name, tool); },
  registerCommand() {}, registerShortcut() {},
  getActiveTools() { return [...tools.keys()]; },
  getAllTools() { return [...tools.values()]; },
  appendEntry() {}, sendMessage() {},
};
const originalFetch = globalThis.fetch;
await activate(pi);
const sm = SessionManager.create(root, join(root, 'sessions'));
const model = { id: 'fixture', provider: 'fixture', api: 'openai-completions',
  baseUrl: 'https://invalid.example', contextWindow: 200000, maxTokens: 4096,
  input: ['text'], reasoning: false };
const ctx = { cwd: root, hasUI: false, model, sessionManager: sm,
  getContextUsage() { return undefined; },
  ui: { setStatus() {}, setWidget() {}, notify() {} },
};
async function emit(name, event) {
  let result;
  for (const fn of handlers.get(name) ?? []) { const r = await fn(event, ctx); if (r !== undefined) result = r; }
  return result;
}
await emit('session_start', {});
assert.equal(process.env.ACP_AUTO_UPDATE, '0');
for (const name of ['compress', 'decompress', 'search_context', 'acp_status', 'acp_cache']) assert(tools.has(name));
assert(![...tools.keys()].some(name => name.startsWith('acp_delegate')));
assert(handlers.has('context'));
for (let i = 0; i < 12; i++) sm.appendMessage({ role: i % 2 ? 'assistant' : 'user',
  content: [{ type: 'text', text: `Fixture message ${i}: EXACT_SENTINEL_${i}. ` + 'Consumed diagnostic. '.repeat(100) }],
  timestamp: Date.now(), ...(i % 2 ? { api: model.api, provider: model.provider, model: model.id,
    stopReason: 'stop', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } } : {}) });
const messages = sm.buildSessionContext().messages;
const projected = await emit('context', { messages, systemPrompt: 'Fixture' });
assert(projected?.messages);
assert.equal(globalThis.fetch, originalFetch);
const textOf = result => result.content.filter(x => x.type === 'text').map(x => x.text).join('\n');
const call = async (name, args) => textOf(await tools.get(name).execute('fixture-' + name, args, new AbortController().signal, undefined, ctx));
const status = await call('acp_status', {});
assert(!/unknown plugin conversation|unsupported|disabled/i.test(status), status);
console.log(status);
const compressed = await call('compress', { content: [{ startId: 'm00001', endId: 'm00004', summary: 'Four consumed fixture messages, each with EXACT_SENTINEL_0 through EXACT_SENTINEL_3.' }] });
console.log(compressed);
const blockId = compressed.match(/\bb\d+\b/)?.[0];
assert(blockId, compressed);
// Pi persists the tool call/result before building the next model context.
sm.appendMessage({ role: 'assistant', content: [{ type: 'toolCall', id: 'fixture-compress', name: 'compress', arguments: {} }],
  api: model.api, provider: model.provider, model: model.id, stopReason: 'toolUse', timestamp: Date.now() });
sm.appendMessage({ role: 'toolResult', toolCallId: 'fixture-compress', toolName: 'compress',
  content: [{ type: 'text', text: compressed }], isError: false, timestamp: Date.now() });
const folded = await emit('context', { messages: sm.buildSessionContext().messages, systemPrompt: 'Fixture' });
assert(JSON.stringify(folded.messages).includes('Four consumed fixture messages'));
assert(!JSON.stringify(folded.messages).includes('Fixture message 1: EXACT_SENTINEL_1. Consumed diagnostic.'));
const restored = await call('decompress', { blockId, inline: true, full: true });
assert(restored.includes('EXACT_SENTINEL_0'), restored);
assert(restored.includes('Consumed diagnostic.'), restored);
// System prompt: ACP text must arrive as a section, not a forced prompt that drops later sections.
const sp = await import(pathToFileURL(join(host, 'dist/core/system-prompt.js')).href);
const options = sp.normalizeBuildSystemPromptOptions({ cwd: root, selectedTools: ['read'], contextFiles: [], skills: [] });
let forced;
const laterSection = event => { event.systemPromptOptions.sections.lab_state = 'LAB_SENTINEL'; };
for (const fn of [...(handlers.get('before_agent_start') ?? []), laterSection]) {
  const event = { type: 'before_agent_start', prompt: 'x', systemPromptOptions: options,
    get systemPrompt() { return sp.buildSystemPrompt(options); } };
  const r = await fn(event, ctx);
  if (r?.systemPrompt !== undefined) forced = r.systemPrompt;
}
assert.equal(forced, undefined, 'ACP must not force the system prompt');
const secs = sp.buildSystemPromptSections(options);
assert(/ACP TAGS/.test(secs.acp_context ?? ''), 'ACP instructions present as acp_context section');
assert((secs.lab_state ?? '').includes('LAB_SENTINEL'), 'later extension section survives');
await emit('session_shutdown', {});
console.log('PASS: standalone hooks, ACP prompt as section (later sections kept), five context tools, delegates off, status, fold and exact retrieval; artifacts: ' + root);
