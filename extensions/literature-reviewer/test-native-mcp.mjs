import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isolatedMcpConfig, installChildMcp, childToolNames, registerChildToolLoadout } from './native-mcp.mjs';

 test('native MCP child config excludes ambient/project servers and retains timeout/scope', () => {
  const cfg = isolatedMcpConfig();
  assert.deepEqual(cfg.servers.map(s => s.name), ['consensus', 'researchfasttrack']);
  assert.deepEqual(cfg.errors, []);
  for (const s of cfg.servers) {
    assert.equal(s.config.timeout, 60);
    assert.equal(s.config.exposure, 'codemode');
    assert.equal(s.scope, 'extension');
  }
  assert.equal(cfg.servers[0].config.oauth.scope, 'search');
  cfg.servers[0].config.url = 'https://unwanted.example';
  assert.equal(isolatedMcpConfig().servers[0].config.url, 'https://mcp.consensus.app/mcp');
});

test('child installs codemode and isolated native MCP without starting OAuth/config writes', async () => {
  const pi = {}, loaded = [];
  let mcpOptions;
  await installChildMcp(pi, {
    createCodemodeExtension: options => host => { assert.equal(host, pi); assert.equal(options.mode, 'on'); loaded.push('codemode'); },
    createMcpExtension: options => host => { assert.equal(host, pi); mcpOptions = options; loaded.push('mcp'); },
  }, '/private/run');
  assert.deepEqual(loaded, ['codemode', 'mcp']);
  assert.deepEqual(mcpOptions.loadConfig({ cwd: '/untrusted/project' }), isolatedMcpConfig());
  assert.equal(mcpOptions.logPath, '/private/run/mcp.log');
  assert.throws(() => mcpOptions.openUrl('https://login.example'), /Headless reviewer cannot sign in/);
  assert.throws(() => mcpOptions.updateConfig({}, {}), /cannot change MCP configuration/);
});

test('child loadout keeps dynamic research MCP callable but blocks other roles and leaf delegation', () => {
  for (const depth of [1, 2]) {
    const handlers = new Map(), selections = [];
    registerChildToolLoadout({ on: (name, fn) => handlers.set(name, fn), setActiveTools: names => selections.push(names) }, depth);
    handlers.get('session_start')();
    handlers.get('before_agent_start')();
    assert.deepEqual(selections, [childToolNames(depth), childToolNames(depth)]);
    const check = toolName => handlers.get('tool_call')({ toolName });
    for (const name of [...childToolNames(depth), 'mcp__consensus__search', 'mcp__researchfasttrack__search',
      'list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource']) assert.equal(check(name), undefined);
    for (const name of ['mcp__zotero__write', 'mcp__consensus_other__search', 'subagent', 'powershell'])
      assert.equal(check(name)?.block, true);
    assert.equal(check('literature_review')?.block, depth === 2 ? true : undefined);
  }
  assert.throws(() => childToolNames(0), /Invalid literature child depth/);
  assert.throws(() => childToolNames(3), /Invalid literature child depth/);
});

test('invalid run directory fails before registering MCP', async () => {
  await assert.rejects(installChildMcp({}, {}, 'relative'), /Invalid literature run directory/);
});

test('launcher uses codemode, not removed adapter gateway, while ambient extensions remain disabled', () => {
  const launcher = fs.readFileSync(new URL('runner.mjs', import.meta.url), 'utf8');
  const integration = fs.readFileSync(new URL('index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(launcher, /'--tools'/);
  assert.equal(childToolNames(1).includes('literature_review'), true);
  assert.equal(childToolNames(2).includes('literature_review'), false);
  assert.match(integration, /registerChildToolLoadout\(pi, depth\)/);
  assert.match(launcher, /'--no-extensions'/);
  assert.match(integration, /await installChildMcp/);
  assert.doesNotMatch(integration, /pi-mcp-adapter|createMcpAdapter/);
});
