import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isolatedMcpConfig, installChildMcp } from './native-mcp.mjs';

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

test('invalid run directory fails before registering MCP', async () => {
  await assert.rejects(installChildMcp({}, {}, 'relative'), /Invalid literature run directory/);
});

test('launcher uses codemode, not removed adapter gateway, while ambient extensions remain disabled', () => {
  const launcher = fs.readFileSync(new URL('runner.mjs', import.meta.url), 'utf8');
  const integration = fs.readFileSync(new URL('index.ts', import.meta.url), 'utf8');
  assert.match(launcher, /'ls','codemode','literature_progress'/);
  assert.match(launcher, /'--no-extensions'/);
  assert.match(integration, /await installChildMcp/);
  assert.doesNotMatch(integration, /pi-mcp-adapter|createMcpAdapter/);
});
