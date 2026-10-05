// Optional installed-Pi integration regression: no model calls, network or credentials.
// PI_TEST_SDK_PATH=/absolute/path/to/pi-coding-agent node --test test-sdk-mcp.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sdkPath = process.env.PI_TEST_SDK_PATH;
test('installed SDK: strict tool allowlist hides dynamic MCP tools; child loadout keeps them callable',
  { skip: !sdkPath, timeout: 30000 }, async t => {
    const sdk = await import(pathToFileURL(path.join(sdkPath, 'dist/index.js')));
    const { Type } = await import(pathToFileURL(path.join(sdkPath, 'node_modules/typebox/build/index.mjs')));
    const { childToolNames, registerChildToolLoadout } = await import('./native-mcp.mjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lit-sdk-mcp-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    for (const strict of [true, false]) {
      const settings = sdk.SettingsManager.inMemory({ defaultTools: ['read'] });
      const loader = new sdk.DefaultResourceLoader({
        cwd: root, agentDir: root, settingsManager: settings,
        noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
        extensionFactories: [sdk.createCodemodeExtension({ mode: 'on' }), pi => {
          if (!strict) registerChildToolLoadout(pi, 2);
          pi.registerTool({ name: 'literature_progress', label: 'Progress', description: 'Fixture',
            parameters: Type.Object({}), execute: async () => ({ content: [], details: undefined }) });
          pi.registerTool({ name: 'mcp__consensus__search', label: 'Search', description: 'Offline MCP fixture',
            exposure: 'codemode', namespace: { name: 'mcp__consensus' }, parameters: Type.Object({}),
            execute: async () => ({ content: [{ type: 'text', text: 'fixture-only' }], details: undefined }) });
        }],
      });
      await loader.reload();
      const { session } = await sdk.createAgentSession({ cwd: root, agentDir: root,
        resourceLoader: loader, settingsManager: settings, sessionManager: sdk.SessionManager.inMemory(),
        ...(strict ? { tools: childToolNames(2) } : {}),
      });
      try {
        await session.bindExtensions({});
        const codemode = session.agent.state.tools.find(tool => tool.name === 'codemode');
        assert.ok(codemode, 'codemode must be active');
        const result = await codemode.execute('fixture-discovery', {
          code: 'text(await searchTools("consensus", { namespace: "mcp__consensus" }));',
        });
        const output = result.content.map(c => c.text ?? '').join('\n');
        assert.equal(output.includes('mcp__consensus__search'), !strict, output);
        if (!strict) {
          assert.deepEqual(new Set(session.getActiveToolNames()), new Set(childToolNames(2)));
          // Synthetic issuing message for the nested tool pipeline; no inference.
          session.agent.state.messages.push({ role: 'assistant', content: [
            { type: 'toolCall', id: 'fixture-call', name: 'codemode', arguments: {} },
          ], api: 'test', provider: 'test', model: 'test', stopReason: 'toolUse', timestamp: Date.now() });
          const call = await codemode.execute('fixture-call', {
            code: 'text(await tools.mcp__consensus__search({}));',
          });
          assert.match(call.content.map(c => c.text ?? '').join('\n'), /fixture-only/);
        }
      } finally { session.dispose(); }
    }
  });
