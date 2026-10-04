import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import usageLimits from '../extensions/usage-limits.ts';

// Usage display must not abort, compact, or inject a replacement agent run.
for (const hasUI of [true, false]) {
  test(`display-only turn boundaries (hasUI=${hasUI})`, async () => {
    const handlers = new Map();
    let status;
    usageLimits({
      on: (name, handler) => handlers.set(name, handler), registerCommand() {},
      sendMessage: () => assert.fail('no synthetic continuation'),
    });
    const ctx = {
      hasUI, model: { provider: 'fixture', id: 'test' },
      compact: () => assert.fail('no manual compaction'),
      abort: () => assert.fail('no abort'),
      ui: { setStatus: (_key, value) => { status = value; }, notify: () => assert.fail('no compaction notice') },
    };
    for (const contextWindow of [100_000, 272_000, 1_000_000]) {
      for (const tokens of [149_999, 150_000, 150_001, contextWindow + 1, null, undefined]) {
        ctx.getContextUsage = () => ({ tokens, contextWindow });
        for (const outcome of ['completed', 'error', 'aborted']) {
          for (const canContinue of [true, false]) {
            await handlers.get('turn_end')({ outcome, context: { canContinue } }, ctx);
          }
        }
        if (hasUI && tokens != null) assert.match(status, /ctx /);
      }
    }
    handlers.get('session_shutdown')();
  });
}

// Optional installed-Pi tests. No live model, credentials, catalog refresh,
// packages, MCP connection or real summarization. Missing SDK is an explicit skip.
let piDir = process.env.PI_USAGE_TEST_PI_DIR;
if (!piDir) try {
  const executable = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['pi'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
  let candidate = path.dirname(fs.realpathSync(executable));
  while (candidate !== path.dirname(candidate)) {
    const manifest = path.join(candidate, 'package.json');
    if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, 'utf8')).name === '@earendil-works/pi-coding-agent') { piDir = candidate; break; }
    candidate = path.dirname(candidate);
  }
} catch {}
const installed = piDir && fs.existsSync(path.join(piDir, 'dist/index.js')) &&
  fs.existsSync(path.join(piDir, 'node_modules/@earendil-works/pi-ai/dist/providers/faux.js'));

let sdk;
if (installed) sdk = await import(pathToFileURL(path.join(piDir, 'dist/index.js')).href);
test('native threshold tracks model context, reserve, model overrides and enabled flag', { skip: !installed }, () => {
  const settings = sdk.SettingsManager.inMemory({});
  const small = { provider: 'fixture', id: 'small', contextWindow: 100_000 };
  const large = { provider: 'fixture', id: 'large', contextWindow: 1_000_000 };
  assert.equal(settings.getCompactionEnabled(), true);
  for (const model of [small, large]) {
    const policy = settings.getCompactionSettings(model);
    assert.equal(policy.reserveTokens, 16_384);
    const threshold = model.contextWindow - policy.reserveTokens;
    assert.equal(sdk.shouldCompact(threshold, model.contextWindow, policy), false);
    assert.equal(sdk.shouldCompact(threshold + 1, model.contextWindow, policy), true);
  }
  const overrides = sdk.SettingsManager.inMemory({ compaction: { modelOverrides: { 'fixture/large': { reserveTokens: 32_000 } } } });
  assert.equal(overrides.getCompactionSettings(large).reserveTokens, 32_000);
  assert.equal(overrides.getCompactionSettings(small).reserveTokens, 16_384);
  settings.setCompactionEnabled(false);
  assert.equal(sdk.shouldCompact(1_000_001, large.contextWindow, settings.getCompactionSettings(large)), false);
});

for (const initialModel of ['small', 'large']) {
  test(`native SDK compaction: ${initialModel} window, tool boundary and uninterrupted continuation`,
    { skip: !installed, timeout: 30_000 }, async t => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), `pi-dynamic-compaction-${initialModel}-`));
    const agentDir = path.join(temp, 'agent');
    fs.mkdirSync(agentDir);
    const previousDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    let session;
    const events = [], attempts = [], errors = [];
    try {
      t.mock.method(globalThis, 'fetch', () => assert.fail('offline test must not fetch'));
      const { fauxProvider, fauxAssistantMessage, fauxToolCall } = await import(pathToFileURL(path.join(piDir, 'node_modules/@earendil-works/pi-ai/dist/providers/faux.js')).href);
      const provider = fauxProvider({ provider: `dynamic-${initialModel}`, api: `dynamic-${initialModel}-api`, models: [
        { id: 'small', contextWindow: 8000, maxTokens: 1024 },
        { id: 'large', contextWindow: 64000, maxTokens: 1024 },
      ] });
      const settingsManager = sdk.SettingsManager.inMemory({ packages: [], retry: { enabled: false }, cacheWarming: 'off',
        compaction: { enabled: true, reserveTokens: 1024, keepRecentTokens: 256 } }, { projectTrusted: true });
      const loader = new sdk.DefaultResourceLoader({ cwd: temp, agentDir, settingsManager,
        noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
        systemPrompt: 'Deterministic offline lifecycle fixture.',
        extensionFactories: [usageLimits, { name: 'native-compaction-fixture', factory(pi) {
          pi.registerProvider(provider.provider);
          for (const name of ['padding', 'mark']) pi.registerTool({ name, label: name, description: 'Synthetic offline fixture',
            parameters: { type: 'object', properties: {}, additionalProperties: false },
            async execute(_id, _args, signal) {
              events.push({ type: `${name}_entered` });
              await new Promise(resolve => setTimeout(resolve, 5));
              assert.equal(signal.aborted, false, 'tool interrupted');
              events.push({ type: `${name}_finished` });
              return { content: [{ type: 'text', text: name === 'padding' ? 'x'.repeat(40_000) : 'mark-ok' }], details: {} };
            },
          });
          pi.on('session_before_compact', event => {
            attempts.push({ reason: event.reason, willRetry: event.willRetry, tokensBefore: event.preparation.tokensBefore });
            // Deterministic summary only. Native trigger, cut selection, persistence
            // and continuation remain real; summary quality is not evaluated.
            return { compaction: { summary: 'Synthetic padding finished. Continue the scripted mark and final response.',
              firstKeptEntryId: event.preparation.firstKeptEntryId, tokensBefore: event.preparation.tokensBefore } };
          });
        } }],
      });
      await loader.reload(); assert.deepEqual(loader.getExtensions().errors, []);
      const manager = sdk.SessionManager.inMemory(temp);
      ({ session } = await sdk.createAgentSession({ cwd: temp, agentDir, model: provider.getModel(initialModel),
        thinkingLevel: 'off', settingsManager, resourceLoader: loader, sessionManager: manager, noTools: true }));
      await session.bindExtensions({ onError: error => errors.push(error) });
      session.subscribe(event => {
        if (['compaction_start', 'compaction_end', 'tool_execution_start', 'tool_execution_end', 'agent_start', 'agent_end', 'turn_end', 'message_end'].includes(event.type)) events.push(event);
      });
      t.mock.method(session.agent, 'abort', () => assert.fail('native threshold must not abort the agent loop'));
      const call = name => fauxAssistantMessage(fauxToolCall(name, {}), { stopReason: 'toolUse' });
      provider.setResponses([call('padding'), call('mark'), fauxAssistantMessage('fixture-done')]);
      await session.prompt('Perform only the three scripted fixture responses.');
      assert.equal(session.getLastAssistantText(), 'fixture-done');
      assert.equal(provider.state.callCount, 3, 'no replay or synthetic extra turn');
      assert.equal(session.isIdle, true);
      assert.equal(events.filter(e => e.type === 'agent_start').length, 1);
      assert(events.filter(e => e.type === 'message_end' && e.message.role === 'assistant').every(e => !['error', 'aborted'].includes(e.message.stopReason)));
      assert(events.filter(e => e.type === 'tool_execution_end').every(e => !e.isError));
      const firstCompaction = events.findIndex(e => e.type === 'compaction_start');
      if (initialModel === 'small') {
        assert(attempts.length >= 1, 'small window should compact');
        assert(firstCompaction > events.findIndex(e => e.type === 'padding_finished'));
        assert(firstCompaction < events.findIndex(e => e.type === 'mark_entered'));
      } else {
        assert.equal(attempts.length, 0, 'large window should keep the same history');
        await session.setModel(provider.getModel('small'));
        provider.appendResponses([fauxAssistantMessage('after-model-switch')]);
        await session.prompt('Return the scripted model-switch result.');
        assert.equal(session.getLastAssistantText(), 'after-model-switch');
        assert(attempts.length >= 1, 'switching to small window should use its threshold');
        assert.equal(provider.state.callCount, 4);
      }
      assert(attempts.every(e => e.reason === 'threshold' && !e.willRetry));
      assert(!manager.getBranch().some(e => e.type === 'custom_message'), 'no hidden continuation');
      assert.deepEqual(errors, []);
      fs.writeFileSync(path.join(temp, 'result.json'), JSON.stringify({ status: 'passed', initialModel, attempts,
        fauxCalls: provider.state.callCount, noLiveProviders: true, limits: 'Synthetic summaries and context sizes; no summary fidelity or real-provider validation.' }, null, 2));
    } finally {
      fs.writeFileSync(path.join(temp, 'events.json'), JSON.stringify(events, null, 2));
      // Restore abort spy before disposal, which legitimately aborts during cleanup.
      t.mock.restoreAll();
      session?.dispose();
      if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir;
      console.log(`Dynamic compaction fixture retained: ${temp}`);
    }
  });
}
