import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { awaitDelegation, loadSubagentApi, runOwnedReview } from './runner.mjs';

const actualAgent = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi/agent');
let piDir = process.env.PI_REVIEW_GATE_PI_DIR;
if (!piDir) try {
  const executable = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['pi'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
  let candidate = path.dirname(fs.realpathSync(executable));
  while (candidate !== path.dirname(candidate)) {
    if (fs.existsSync(path.join(candidate, 'package.json')) &&
        JSON.parse(fs.readFileSync(path.join(candidate, 'package.json'), 'utf8')).name === '@earendil-works/pi-coding-agent') { piDir = candidate; break; }
    candidate = path.dirname(candidate);
  }
} catch {}
const installed = piDir && fs.existsSync(path.join(piDir, 'dist/index.js')) && fs.existsSync(path.join(actualAgent, 'npm/node_modules/pi-subagents/index.js'));

test('installed SDK + real subagents: closed direct/nested/workflow/alias routes; explicit faux review and safety review',
  { skip: !installed, timeout: 90_000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-review-gate-'));
  const cwd = path.join(temp, 'workspace'), agentDir = path.join(temp, 'agent');
  fs.mkdirSync(cwd, { recursive: true }); fs.mkdirSync(path.join(agentDir, 'npm/node_modules'), { recursive: true });
  fs.mkdirSync(path.join(agentDir, 'agents'), { recursive: true });
  fs.symlinkSync(path.join(actualAgent, 'npm/node_modules/pi-subagents'), path.join(agentDir, 'npm/node_modules/pi-subagents'), 'dir');
  const priorDir = process.env.PI_CODING_AGENT_DIR, priorRoot = process.env.PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  // node --test is not Pi's CLI, so identify the installed SDK to the package's supported host resolver.
  process.env.PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT = piDir;
  let session;
  try {
    const sdk = await import(pathToFileURL(path.join(piDir, 'dist/index.js')).href);
    const { fauxProvider, fauxAssistantMessage, fauxToolCall } = await import(pathToFileURL(path.join(piDir, 'node_modules/@earendil-works/pi-ai/dist/providers/faux.js')).href);
    const main = fauxProvider({ provider: 'gate-main', api: 'gate-main-api' });
    const worker = fauxProvider({ provider: 'gate-worker', api: 'gate-worker-api' });
    const reviewer = fauxProvider({ provider: 'gate-reviewer', api: 'gate-reviewer-api' });
    const safety = fauxProvider({ provider: 'gate-safety', api: 'gate-safety-api' });
    const modelName = provider => `${provider.getModel().provider}/${provider.getModel().id}`;
    const solRoot = process.env.PI_REVIEW_GATE_SOL_DIR;
    if (solRoot) {
      assert(fs.existsSync(path.join(solRoot, 'src/sol-pi/index.ts')));
      fs.mkdirSync(path.join(cwd, '.pi'), { recursive: true });
      fs.writeFileSync(path.join(cwd, '.pi/sol-pi.json'), JSON.stringify({ version: 1, actionFusion: true,
        observationPack: false, evidencePreservingReducer: false, onlineContextCompact: false }));
    }
    const settings = {
      packages: [], enabledModels: [], retry: { enabled: false }, compaction: { enabled: false }, cacheWarming: 'off',
      subagents: { asyncByDefault: false, agentOverrides: {
        worker: { model: modelName(worker) }, reviewer: { model: modelName(reviewer) },
      } },
    };
    fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify(settings));
    fs.writeFileSync(path.join(agentDir, 'agents/astra-code-reviewer.md'), `---\nname: astra-code-reviewer\ndescription: Safety review fixture\ntools: read\nmodel: ${modelName(safety)}\n---\nReturn fixture safety findings only.\n`);
    fs.writeFileSync(path.join(agentDir, 'agents/project-code-reviewer.md'), `---\nname: project-code-reviewer\ndescription: Alias fixture\naliases: codecheck\ntools: read\nmodel: ${modelName(reviewer)}\n---\nReturn fixture review findings only.\n`);
    fs.writeFileSync(path.join(cwd, 'review-script.js'), 'return runs.run("blocked", { agent: ["rev", "iewer"].join(""), task: "No permission" });\n');
    const call = (name, args) => fauxAssistantMessage(fauxToolCall(name, args), { stopReason: 'toolUse' });
    main.setResponses([
      call('subagent', { agent: 'reviewer', task: 'No permission', async: false }),
      call('codemode', { code: 'text(await tools.subagent({agent:"reviewer", task:"Nested no permission", async:false}));' }),
      call('codemode', { code: 'text(await tools.review_proxy({}));' }),
      call('subagent', { workflow: './review-script.js', async: false }),
      call('subagent', { agent: 'codecheck', task: 'Alias no permission', async: false }),
      call('subagent', { agent: 'worker', task: 'Return fixture worker reply', async: false }),
      ...(solRoot ? [
        call('write', { path: 'fusion-fixture.txt', content: 'fusion-ok', then_run: { command: "node -e \"require('node:assert/strict').equal(require('node:fs').readFileSync('fusion-fixture.txt','utf8'),'fusion-ok')\"", timeout: 5 } }),
        call('write', { path: 'plain-fixture.txt', content: 'No mandatory validator' }),
      ] : []),
      fauxAssistantMessage('Fixture main settled'),
    ]);
    worker.setResponses([fauxAssistantMessage('Fixture worker reply')]);
    reviewer.setResponses([fauxAssistantMessage('CHANGES_REQUESTED: fixture review is not execution approval')]);
    safety.setResponses([fauxAssistantMessage('APPROVED_WITH_CAVEATS: fixture safety verdict; no scientific execution authority')]);
    const api = await loadSubagentApi(agentDir);
    const providers = [main, worker, reviewer, safety];
    const settingsManager = sdk.SettingsManager.inMemory(settings, { projectTrusted: true });
    const errors = [], toolResults = [], events = sdk.createEventBus();
    let captured;
    const loader = new sdk.DefaultResourceLoader({ cwd, agentDir, settingsManager, eventBus: events,
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      additionalExtensionPaths: [path.join(api.root, 'index.js'), path.join(import.meta.dirname, 'index.ts'),
        ...(solRoot ? [path.join(solRoot, 'src/sol-pi/index.ts')] : [])],
      extensionFactories: [
        { name: 'gate-fixture', factory(pi) {
          for (const provider of providers) pi.registerProvider(provider.provider);
          pi.registerTool({ name: 'review_proxy', label: 'Fixture nested delegation', description: 'Offline fixture only',
            parameters: { type: 'object', properties: {}, additionalProperties: false },
            async execute(_id, _args, signal) {
              const reply = await awaitDelegation(events, api, { requestId: 'nested', ownerRunId: 'nested-owner', nodeId: 'nested-node',
                agent: 'reviewer', task: 'Nested no permission', context: 'fresh', cwd, result: { kind: 'text' } }, signal);
              return { content: [{ type: 'text', text: `Nested receipt: ${reply.status}: ${reply.error || ''}` }], details: reply };
            },
          });
          pi.on('session_start', (_event, ctx) => { captured = ctx; });
          pi.on('tool_result', event => { toolResults.push(event); });
        } },
        sdk.createCodemodeExtension({ mode: 'on' }),
      ],
    });
    await loader.reload(); assert.deepEqual(loader.getExtensions().errors, []);
    // Persisted manager exercises the real package's file-path capability identity.
    const manager = sdk.SessionManager.create(cwd, path.join(temp, 'sessions'));
    ({ session } = await sdk.createAgentSession({ cwd, agentDir, model: main.getModel(), settingsManager, resourceLoader: loader, sessionManager: manager }));
    await session.bindExtensions({ onError: error => errors.push(error) });
    session.setActiveToolsByName([...new Set([...session.getActiveToolNames(), 'subagent', 'codemode'])]);
    await session.prompt('Execute only the scripted offline fixture');
    fs.writeFileSync(path.join(temp, 'tool-results.json'), JSON.stringify(toolResults, null, 2));
    assert.equal(session.getLastAssistantText(), 'Fixture main settled');
    if (solRoot) {
      assert(toolResults.some(event => event.toolName === 'write' && /then_run:succeeded/.test(event.content.map(part => part.text || '').join('\n'))));
      assert.equal(fs.readFileSync(path.join(cwd, 'plain-fixture.txt'), 'utf8'), 'No mandatory validator');
    }
    const mainCalls = solRoot ? 9 : 7;
    assert.equal(reviewer.state.callCount, 0, 'Unauthorized reviewer was launched');
    assert.equal(safety.state.callCount, 0); assert.equal(worker.state.callCount, 1);
    const resultText = event => event.content.map(part => part.text || '').join('\n');
    assert(session.messages.some(event => event.role === 'toolResult' && /requires an explicit/.test(resultText(event))), 'No frontend denial');
    assert(toolResults.some(event => /Capability ceiling/.test(resultText(event))), 'Opaque workflow/alias was not rejected at launch');
    assert(toolResults.some(event => event.toolName === 'review_proxy' && /Nested receipt: failed/.test(resultText(event))), 'Nested RPC was not rejected');
    const closed = api.resolveCurrentSubagentCapabilityCeiling(manager.getSessionFile() ?? manager.getSessionId());
    assert(!closed.allowedAgents.includes('reviewer')); assert(closed.allowedAgents.includes('worker'));
    await session.prompt('/review-change Inspect only the fixture code');
    assert.equal(reviewer.state.callCount, 1); assert.equal(main.state.callCount, mainCalls, 'Command made a main-model call');
    const dirs = fs.readdirSync(path.join(agentDir, 'review-change-runs'));
    assert.equal(dirs.length, 1);
    const receipt = JSON.parse(fs.readFileSync(path.join(agentDir, 'review-change-runs', dirs[0], 'result.json'), 'utf8'));
    assert.equal(receipt.status, 'completed'); assert.equal(receipt.model.replace(/:(off|minimal|low|medium|high|xhigh|max)$/, ''), modelName(reviewer));
    assert.equal(receipt.result.text, 'CHANGES_REQUESTED: fixture review is not execution approval');
    const ownedRequest = JSON.parse(fs.readFileSync(path.join(agentDir, 'review-change-runs', dirs[0], 'request.json'), 'utf8'));
    assert.equal(ownedRequest.packageVersion, api.version);
    assert.deepEqual(ownedRequest.apiCompatibility, { contract: 'review-gate-api-v1', probe: 'passed' });
    assert(!api.resolveCurrentSubagentCapabilityCeiling(manager.getSessionFile()).allowedAgents.includes('reviewer'));
    await session.prompt('/review-change --safety Inspect the fixture pre-execution slice');
    assert.equal(safety.state.callCount, 1); assert.equal(reviewer.state.callCount, 1); assert.equal(main.state.callCount, mainCalls);
    // Even trusted RPC requests from the main host remain behind the permanently closed ceiling.
    const request = { requestId: 'blocked-rpc', ownerRunId: 'blocked-owner', nodeId: 'blocked-node', agent: 'reviewer',
      task: 'No command permission', context: 'fresh', cwd, result: { kind: 'text' } };
    const blocked = await awaitDelegation(events, api, request, AbortSignal.timeout(10_000));
    assert.notEqual(blocked.status, 'completed'); assert.equal(reviewer.state.callCount, 1);
    // Exercise cancellation while a real package-owned foreground faux child is active.
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    reviewer.setResponses([async (_context, options) => {
      entered();
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 2000);
        const finish = () => { clearTimeout(timer); resolve(); };
        if (options?.signal?.aborted) finish();
        else options?.signal?.addEventListener('abort', finish, { once: true });
      });
      return fauxAssistantMessage('Cancelled fixture must never be approval');
    }]);
    const reviewing = session.prompt('/review-change Cancellation fixture');
    await started;
    await session.prompt('/review-cancel');
    await reviewing;
    assert.equal(reviewer.state.callCount, 2);
    assert(!api.resolveCurrentSubagentCapabilityCeiling(manager.getSessionFile()).allowedAgents.includes('reviewer'));
    const receipts = fs.readdirSync(path.join(agentDir, 'review-change-runs')).map(dir => JSON.parse(fs.readFileSync(path.join(agentDir, 'review-change-runs', dir, 'result.json'), 'utf8')));
    assert(receipts.some(receipt => receipt.status === 'cancelled'));
    assert.deepEqual(errors, []); assert(captured);
    console.log(`ACTION_FUSION_OPTIONAL_CHECK: ${solRoot ? 'passed (fused and unfused writes)' : 'not requested'}`);
    console.log('OFFLINE_REVIEW_GATE_OK: direct, nested Codemode, opaque workflow, alias and main RPC denied; worker retained; command-owned ordinary/safety faux reviews executed once each, then one bounded cancellation fixture. No live providers or real credentials.');
  } finally {
    session?.dispose();
    if (priorDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = priorDir;
    if (priorRoot === undefined) delete process.env.PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT; else process.env.PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT = priorRoot;
    // Retain the small temp fixture and receipts for inspection, including on failure.
    console.log(`Review-gate offline fixture retained: ${temp}`);
  }
});
