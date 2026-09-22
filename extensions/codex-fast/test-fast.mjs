import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

// Pi itself loads TS through jiti. These dependency-free tests use Node's native
// type stripping (Node 22.18+); older Node versions explicitly skip this suite.
const factory = process.features.typescript ? (await import('./index.ts')).default : undefined;
const codexModel = { id: 'gpt-test', provider: 'openai-codex', api: 'openai-codex-responses' };

function harness(model = { ...codexModel }, hasUI = true) {
  const handlers = new Map(), commands = new Map(), notices = [], statuses = new Map();
  factory({
    on: (name, handler) => handlers.set(name, handler),
    registerCommand: (name, command) => commands.set(name, command),
    // No model/thinking setters, file APIs or network helpers: using them fails.
  });
  const ctx = { model, thinkingLevel: 'xhigh', hasUI, ui: {
    notify: (text, level) => { assert.ok(hasUI); notices.push({ text, level }); },
    setStatus: (key, value) => { assert.ok(hasUI); statuses.set(key, value); },
  } };
  return { ctx, notices, statuses, commands,
    command: (args = '') => commands.get('fast').handler(args, ctx),
    emit: (name, event = {}) => handlers.get(name)(event, ctx),
    request: (payload = { model: ctx.model?.id }) => handlers.get('before_provider_request')({ payload }, ctx),
  };
}

describe('Codex Fast (offline)', { skip: !factory && 'Node native TypeScript support required' }, () => {
  test('off initially; bare command/status never enables billing changes', async () => {
    const h = harness();
    assert.equal(h.request(), undefined);
    for (const command of ['', 'status', '   ']) {
      await h.command(command);
      assert.equal(h.request(), undefined);
    }
    assert.match(h.notices.at(-1).text, /Fast off/);
    assert.equal(h.commands.size, 1);
  });

  test('on changes only the tier, without mutating the request/model/thinking', async () => {
    const h = harness();
    const payload = Object.freeze({ model: 'gpt-test', service_tier: 'auto',
      reasoning: Object.freeze({ effort: 'xhigh' }), input: Object.freeze([{ role: 'user', content: 'fixture' }]),
      tools: Object.freeze([]), store: false, stream: true });
    await h.command('on');
    const result = h.request(payload);
    assert.deepEqual(result, { ...payload, service_tier: 'priority' });
    assert.notEqual(result, payload);
    assert.equal(result.reasoning, payload.reasoning);
    assert.equal(result.input, payload.input);
    assert.equal(payload.service_tier, 'auto');
    assert.deepEqual(h.ctx.model, codexModel);
    assert.equal(h.ctx.thinkingLevel, 'xhigh');
    assert.match(h.statuses.get('codex-fast'), /priority requested/);
    assert.match(h.notices.at(-1).text, /quota\/cost/);
    await h.command('status');
    assert.match(h.notices.at(-1).text, /not server-confirmed/);
  });

  test('off stops injecting priority; existing upstream tiers are untouched', async () => {
    const h = harness(); await h.command('on'); await h.command('off');
    const payload = { model: 'gpt-test', service_tier: 'priority' };
    assert.equal(h.request(payload), undefined);
    assert.equal(payload.service_tier, 'priority');
    assert.equal(h.statuses.get('codex-fast'), undefined);
  });

  test('unsupported provider or API cannot enable Fast', async () => {
    for (const model of [undefined, { ...codexModel, provider: 'openai' },
      { ...codexModel, api: 'openai-responses' }, { ...codexModel, provider: 'anthropic' }]) {
      const h = harness(); h.ctx.model = model;
      await h.command('on'); assert.equal(h.request(), undefined);
      assert.match(h.notices.at(-1).text, /requires/);
    }
  });

  test('numbered multi-codex aliases work; malformed aliases do not', async () => {
    for (const provider of ['openai-codex-2', 'openai-codex-10']) {
      const h = harness({ ...codexModel, provider }); await h.command('on');
      assert.equal(h.request().service_tier, 'priority');
      h.emit('model_select', { model: h.ctx.model });
      assert.equal(h.request(), undefined);
    }
    for (const provider of ['openai-codex-0', 'openai-codex-1', 'openai-codex-02', 'openai-codex-other']) {
      const h = harness({ ...codexModel, provider }); await h.command('on');
      assert.equal(h.request(), undefined);
    }
  });

  test('unrelated requests are unchanged even when the active model is Codex', async () => {
    const h = harness(); await h.command('on');
    for (const payload of [null, false, 'data', [], {}, { model: 'other-model' }]) {
      assert.equal(h.request(payload), undefined);
    }
    assert.equal(h.request({ model: 'gpt-test' }).service_tier, 'priority');
  });

  test('provider/API guard is checked again for each request', async () => {
    const h = harness(); await h.command('on');
    h.ctx.model = { ...codexModel, provider: 'openai' };
    assert.equal(h.request({ model: 'gpt-test' }), undefined);
  });

  test('invalid commands leave the current state unchanged', async () => {
    const h = harness(); await h.command('enable'); assert.equal(h.request(), undefined);
    await h.command(' ON '); assert.equal(h.request().service_tier, 'priority');
    await h.command('off please'); assert.equal(h.request().service_tier, 'priority');
    assert.match(h.notices.at(-1).text, /No change/);
  });

  test('session starts/reloads/resumes and shutdown reset off', async () => {
    const h = harness();
    for (const reason of ['startup', 'reload', 'new', 'resume', 'fork']) {
      await h.command('on'); h.emit('session_start', { reason });
      assert.equal(h.request(), undefined);
    }
    await h.command('on'); h.emit('session_shutdown', { reason: 'quit' });
    assert.equal(h.request(), undefined);
  });

  test('model changes reset off, including switching back to Codex', async () => {
    const h = harness(); await h.command('on');
    h.ctx.model = { ...codexModel, id: 'other-codex-model' };
    h.emit('model_select', { model: h.ctx.model }); assert.equal(h.request(), undefined);
    h.ctx.model = { ...codexModel }; h.emit('model_select', { model: h.ctx.model });
    assert.equal(h.request(), undefined);
    assert.match(h.notices.at(-1).text, /reset to off/);
  });

  test('separate instances never inherit opt-in state', async () => {
    const a = harness(), b = harness(); await a.command('on');
    assert.equal(a.request().service_tier, 'priority'); assert.equal(b.request(), undefined);
  });

  test('headless context does not use UI methods', async () => {
    const h = harness({ ...codexModel }, false);
    h.emit('session_start'); await h.command('status'); await h.command('on');
    assert.equal(h.request().service_tier, 'priority'); await h.command('off');
    assert.equal(h.request(), undefined); assert.equal(h.notices.length, 0);
  });

  test('argument completions are bounded to supported actions', () => {
    const complete = harness().commands.get('fast').getArgumentCompletions;
    assert.deepEqual(complete('o').map(x => x.value), ['on', 'off']);
    assert.deepEqual(complete('sta').map(x => x.value), ['status']);
    assert.equal(complete('invalid'), null);
  });
});
