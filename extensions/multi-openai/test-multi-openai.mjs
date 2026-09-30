import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mod = process.features.typescript ? await import("./index.ts") : undefined;

function createMockNativeProvider() {
  const models = [
    { id: "gpt-6.1-sol", name: "GPT 6.1 Sol", provider: "openai", api: "openai-responses", reasoning: true },
    { id: "gpt-6-astra", name: "GPT 6 Astra", provider: "openai", api: "openai-responses", reasoning: true },
  ];

  return {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    headers: { "User-Agent": "test" },
    auth: {
      oauth: {
        name: "OpenAI",
        login: async (interaction, options) => {
          interaction.notify({ type: "auth_url", url: "https://auth.openai.com/test" });
          return { type: "oauth", access: "mock-token", refresh: "mock-refresh", expires: Date.now() + 3600000 };
        },
        refresh: async () => ({ type: "oauth", access: "mock-refreshed", refresh: "mock-refresh", expires: Date.now() + 3600000 }),
        toAuth: async () => ({ type: "bearer", token: "mock-token" }),
      },
    },
    getModels: () => models,
    getAllModels: () => models,
    stream: (model, context, options) => {
      const stream = new mod.LocalAssistantMessageEventStream();
      setTimeout(() => {
        stream.push({
          type: "text_delta",
          delta: "Hello from native",
          partial: { role: "assistant", content: [{ type: "text", text: "Hello from native" }], provider: model.provider, model: model.id },
        });
        stream.push({
          type: "done",
          message: { role: "assistant", content: [{ type: "text", text: "Hello from native" }], provider: model.provider, model: model.id, stopReason: "stop" },
        });
        stream.end();
      }, 5);
      return stream;
    },
    streamSimple: (model, context, options) => {
      const stream = new mod.LocalAssistantMessageEventStream();
      setTimeout(() => {
        stream.push({
          type: "done",
          message: { role: "assistant", content: [{ type: "text", text: "Simple hello" }], provider: model.provider, model: model.id, stopReason: "stop" },
        });
        stream.end();
      }, 5);
      return stream;
    },
  };
}

function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.mocksignature`;
}

function createHarness(options = {}) {
  const registeredProviders = new Map();
  const handlers = new Map();
  const commands = new Map();
  const notices = [];
  const statuses = new Map();
  let currentModel = options.model ?? { id: "gpt-6.1-sol", provider: "openai-2", api: "openai-responses" };

  const pi = {
    registerProvider: (provider) => {
      registeredProviders.set(provider.id, provider);
    },
    registerCommand: (name, cmd) => {
      commands.set(name, cmd);
    },
    on: (event, handler) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    },
    setModel: async (model) => {
      currentModel = model;
      if (options.ctx) options.ctx.model = model;
      return true;
    },
  };

  const ctx = {
    get model() { return currentModel; },
    set model(m) { currentModel = m; },
    hasUI: options.hasUI ?? true,
    ui: {
      notify: (text, level) => notices.push({ text, level }),
      setStatus: (key, value) => statuses.set(key, value),
      select: options.selectFn ?? (async (title, choices) => choices[0]),
    },
  };

  return {
    pi,
    ctx,
    registeredProviders,
    handlers,
    commands,
    notices,
    statuses,
    emit: (event, arg = {}) => handlers.get(event)?.(arg, ctx),
    command: (name, args = "") => commands.get(name)?.handler(args, ctx),
  };
}

describe("multi-openai (offline)", { skip: !mod && "Node native TypeScript support required" }, () => {
  test("slotForProvider and providerForSlot mappings", () => {
    assert.equal(mod.slotForProvider("openai"), 1);
    assert.equal(mod.slotForProvider("openai-2"), 2);
    assert.equal(mod.slotForProvider("openai-3"), 3);
    assert.equal(mod.slotForProvider("openai-10"), 10);
    assert.equal(mod.slotForProvider(undefined), undefined);
    assert.equal(mod.slotForProvider(""), undefined);
    assert.equal(mod.slotForProvider("openai-1"), undefined);
    assert.equal(mod.slotForProvider("openai-codex"), undefined);
    assert.equal(mod.slotForProvider("anthropic"), undefined);

    assert.equal(mod.providerForSlot(1), "openai");
    assert.equal(mod.providerForSlot(2), "openai-2");
    assert.equal(mod.providerForSlot(5), "openai-5");

    assert.equal(mod.isManagedProvider("openai"), true);
    assert.equal(mod.isManagedProvider("openai-2"), true);
    assert.equal(mod.isManagedProvider("openai-codex"), false);
    assert.equal(mod.isManagedProvider("anthropic"), false);
  });

  test("isOAuthCredential validation", () => {
    assert.equal(mod.isOAuthCredential({ type: "oauth", access: "tok", refresh: "ref" }), true);
    assert.equal(mod.isOAuthCredential({ type: "api_key", key: "sk-123" }), false);
    assert.equal(mod.isOAuthCredential({ type: "oauth", access: "tok" }), false);
    assert.equal(mod.isOAuthCredential(null), false);
    assert.equal(mod.isOAuthCredential("string"), false);
  });

  test("parseJwtPayload extracts claims", () => {
    const token = makeJwt({ sub: "user-12345", email: "test@example.com" });
    const payload = mod.parseJwtPayload(token);
    assert.deepEqual(payload, { sub: "user-12345", email: "test@example.com" });

    assert.equal(mod.parseJwtPayload("invalid-token"), undefined);
    assert.equal(mod.parseJwtPayload("not.a.token"), undefined);
  });

  test("formatDuration formats human-readable durations", () => {
    assert.equal(mod.formatDuration(-100), "expired");
    assert.equal(mod.formatDuration(0), "expired");
    assert.equal(mod.formatDuration(50 * 1000), "1m");
    assert.equal(mod.formatDuration(3600 * 1000), "1h");
    assert.equal(mod.formatDuration(3700 * 1000), "1h 2m");
    assert.equal(mod.formatDuration(25 * 3600 * 1000), "1d 1h");
  });

  test("nativeModel rewrites alias provider to native", () => {
    const alias = { id: "gpt-6.1-sol", provider: "openai-2", api: "openai-responses" };
    const rewritten = mod.nativeModel(alias);
    assert.equal(rewritten.provider, "openai");
    assert.equal(rewritten.id, "gpt-6.1-sol");

    const native = { id: "gpt-6.1-sol", provider: "openai", api: "openai-responses" };
    assert.equal(mod.nativeModel(native), native);
  });

  test("nativeContext rewrites assistant messages to native openai", () => {
    const context = {
      messages: [
        { role: "user", content: "hello" },
        {
          role: "assistant",
          provider: "openai-2",
          model: "gpt-6.1-sol",
          content: [{ type: "text", text: "world" }],
          deferred: { handle: "def-1", provider: "openai-2" },
        },
        { role: "assistant", provider: "anthropic", model: "claude-3-opus", content: [{ type: "text", text: "ok" }] },
      ],
    };

    const rewritten = mod.nativeContext(context);
    assert.equal(rewritten.messages[0].role, "user");
    assert.equal(rewritten.messages[1].provider, "openai");
    assert.equal(rewritten.messages[1].deferred.provider, "openai");
    assert.equal(rewritten.messages[2].provider, "anthropic");
  });

  test("aliasMessage and aliasEvent rewrite providers correctly", () => {
    const msg = {
      role: "assistant",
      provider: "openai",
      content: [],
      deferred: { handle: "def-2", provider: "openai" },
    };
    const aliased = mod.aliasMessage(msg, "openai-3");
    assert.equal(aliased.provider, "openai-3");
    assert.equal(aliased.deferred.provider, "openai-3");

    const doneEvent = { type: "done", message: msg };
    const aliasedDone = mod.aliasEvent(doneEvent, "openai-2");
    assert.equal(aliasedDone.message.provider, "openai-2");

    const errorEvent = { type: "error", error: msg };
    const aliasedError = mod.aliasEvent(errorEvent, "openai-2");
    assert.equal(aliasedError.error.provider, "openai-2");

    const deltaEvent = { type: "text_delta", delta: "hi", partial: msg };
    const aliasedDelta = mod.aliasEvent(deltaEvent, "openai-2");
    assert.equal(aliasedDelta.partial.provider, "openai-2");
  });

  test("LocalAssistantMessageEventStream behaves as an async event stream", async () => {
    const stream = mod.createAssistantMessageEventStream();
    const finalMsg = { role: "assistant", content: [{ type: "text", text: "result" }], provider: "openai" };

    setTimeout(() => {
      stream.push({ type: "text_delta", delta: "r", partial: finalMsg });
      stream.push({ type: "done", message: finalMsg });
      stream.end();
    }, 5);

    const received = [];
    for await (const ev of stream) {
      received.push(ev);
    }

    assert.equal(received.length, 2);
    assert.equal(received[0].type, "text_delta");
    assert.equal(received[1].type, "done");

    const result = await stream.result();
    assert.deepEqual(result, finalMsg);
  });

  test("aliasStream rewrites stream events to target slot provider", async () => {
    const native = createMockNativeProvider();
    const model = { id: "gpt-6.1-sol", provider: "openai-2", api: "openai-responses" };
    const nativeStream = native.stream(mod.nativeModel(model), { messages: [] }, {});
    const wrappedStream = mod.aliasStream(nativeStream, model, "openai-2");

    const events = [];
    for await (const event of wrappedStream) {
      events.push(event);
    }

    assert.equal(events.length, 2);
    assert.equal(events[0].type, "text_delta");
    assert.equal(events[0].partial.provider, "openai-2");
    assert.equal(events[1].type, "done");
    assert.equal(events[1].message.provider, "openai-2");

    const result = await wrappedStream.result();
    assert.equal(result.provider, "openai-2");
  });

  test("createOpenAIAliasProvider instantiates a valid slot provider", async () => {
    const native = createMockNativeProvider();
    const aliasProvider = mod.createOpenAIAliasProvider(native, 2);

    assert.equal(aliasProvider.id, "openai-2");
    assert.equal(aliasProvider.name, "OpenAI #2");
    assert.equal(aliasProvider.baseUrl, native.baseUrl);

    const models = aliasProvider.getModels();
    assert.equal(models.length, 2);
    assert.equal(models[0].provider, "openai-2");
    assert.equal(models[1].provider, "openai-2");

    // Test OAuth login incognito warning wrapper
    let notifiedNotice = undefined;
    const mockInteraction = {
      notify: (notice) => { notifiedNotice = notice; },
    };
    await aliasProvider.auth.oauth.login(mockInteraction, {});
    assert.ok(notifiedNotice);
    assert.equal(notifiedNotice.type, "auth_url");
  });

  test("readCredentials parses auth.json correctly", () => {
    const tempDir = join(tmpdir(), `pi-test-auth-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });

    try {
      const authContent = {
        openai: { type: "oauth", access: "token1", refresh: "ref1", expires: Date.now() + 10000 },
        "openai-2": { type: "oauth", access: "token2", refresh: "ref2", expires: Date.now() + 20000 },
        "openai-3": { type: "api_key", key: "sk-ignored" },
        anthropic: { type: "api_key", key: "sk-ant" },
      };
      writeFileSync(join(tempDir, "auth.json"), JSON.stringify(authContent));

      const creds = mod.readCredentials(tempDir);
      assert.equal(creds.size, 2);
      assert.equal(creds.get(1)?.access, "token1");
      assert.equal(creds.get(2)?.access, "token2");
      assert.equal(creds.has(3), false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("multiOpenAI registers default slot 2 and registers active slots from auth.json", async () => {
    const tempDir = join(tmpdir(), `pi-test-init-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });

    try {
      const authContent = {
        openai: { type: "oauth", access: makeJwt({ sub: "user-1" }), refresh: "ref1", expires: Date.now() + 10000 },
        "openai-3": { type: "oauth", access: makeJwt({ sub: "user-3" }), refresh: "ref3", expires: Date.now() + 10000 },
      };
      writeFileSync(join(tempDir, "auth.json"), JSON.stringify(authContent));

      const h = createHarness();
      const native = createMockNativeProvider();

      await mod.default(h.pi, { native, agentDir: tempDir });

      // Default slot 2 is registered immediately, slot 3 is registered because credentials exist
      assert.ok(h.registeredProviders.has("openai-2"));
      assert.ok(h.registeredProviders.has("openai-3"));
      assert.equal(h.registeredProviders.has("openai"), false); // Slot 1 is native, not alias
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("duplicate account detection emits warning if slot 1 and slot 2 share sub", async () => {
    const tempDir = join(tmpdir(), `pi-test-dup-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });

    try {
      const sharedSub = "user-shared-account-id";
      const authContent = {
        openai: { type: "oauth", access: makeJwt({ sub: sharedSub }), refresh: "ref1", expires: Date.now() + 10000 },
        "openai-2": { type: "oauth", access: makeJwt({ sub: sharedSub }), refresh: "ref2", expires: Date.now() + 10000 },
      };
      writeFileSync(join(tempDir, "auth.json"), JSON.stringify(authContent));

      const h = createHarness();
      const native = createMockNativeProvider();

      // Mock fetchFn returning identical user info
      const mockFetch = async () => ({
        ok: true,
        json: async () => ({ email: "same@domain.com", name: "Same User" }),
      });

      await mod.default(h.pi, { native, agentDir: tempDir, fetchFn: mockFetch });

      await h.emit("session_start");

      const dupWarning = h.notices.find((n) => n.text.includes("SAME ChatGPT account"));
      assert.ok(dupWarning, "Expected duplicate account warning to be emitted");
      assert.equal(dupWarning.level, "warning");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("status footer reflects current model provider and login state", async () => {
    const tempDir = join(tmpdir(), `pi-test-footer-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });

    try {
      const authContent = {
        openai: { type: "oauth", access: makeJwt({ sub: "user-slot1" }), refresh: "ref1", expires: Date.now() + 10000 },
      };
      writeFileSync(join(tempDir, "auth.json"), JSON.stringify(authContent));

      const h = createHarness({ model: { id: "gpt-6.1-sol", provider: "openai", api: "openai-responses" } });
      const native = createMockNativeProvider();

      const mockFetch = async () => ({
        ok: true,
        json: async () => ({ email: "user1@openai.com" }),
      });

      await mod.default(h.pi, { native, agentDir: tempDir, fetchFn: mockFetch });

      await h.emit("session_start");
      assert.match(h.statuses.get("multi-openai"), /OpenAI #1 · user1@openai.com/);

      // Switch to unauthenticated slot 2
      h.ctx.model = { id: "gpt-6.1-sol", provider: "openai-2", api: "openai-responses" };
      await h.emit("model_select");
      assert.match(h.statuses.get("multi-openai"), /OpenAI #2 · not logged in/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("isRateLimitError detects status and error message signatures", () => {
    assert.equal(mod.isRateLimitError(429), true);
    assert.equal(mod.isRateLimitError(200), false);
    assert.equal(mod.isRateLimitError(undefined, "OpenAI API error (429): Rate limit exceeded"), true);
    assert.equal(mod.isRateLimitError(undefined, "The ChatGPT user has reached their Subscription Sharing usage limit"), true);
    assert.equal(mod.isRateLimitError(undefined, "subscription_sharing_usage_limit_exceeded"), true);
    assert.equal(mod.isRateLimitError(undefined, "Too Many Requests"), true);
    assert.equal(mod.isRateLimitError(undefined, "Model overloaded"), false);
  });

  test("pickNextAvailableSlot rotates cyclically across all authenticated slots", () => {
    assert.equal(mod.pickNextAvailableSlot(1, [1, 2, 3]), 2);
    assert.equal(mod.pickNextAvailableSlot(2, [1, 2, 3]), 3);
    assert.equal(mod.pickNextAvailableSlot(3, [1, 2, 3]), 1);
    assert.equal(mod.pickNextAvailableSlot(1, [1]), undefined);
    assert.equal(mod.pickNextAvailableSlot(2, [1, 2]), 1);
  });

  test("automatic failover switches model on HTTP 429 via errorMessage without after_provider_response", async () => {
    const tempDir = join(tmpdir(), `pi-test-failover-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });

    try {
      const authContent = {
        openai: { type: "oauth", access: makeJwt({ sub: "user-1" }), refresh: "ref1", expires: Date.now() + 10000 },
        "openai-2": { type: "oauth", access: makeJwt({ sub: "user-2" }), refresh: "ref2", expires: Date.now() + 10000 },
        "openai-3": { type: "oauth", access: makeJwt({ sub: "user-3" }), refresh: "ref3", expires: Date.now() + 10000 },
      };
      writeFileSync(join(tempDir, "auth.json"), JSON.stringify(authContent));

      const h = createHarness({ model: { id: "gpt-6.1-sol", provider: "openai-2", api: "openai-responses" } });
      const native = createMockNativeProvider();

      await mod.default(h.pi, { native, agentDir: tempDir });

      // Simulate turn where native SDK throws on 429: after_provider_response is NEVER called!
      await h.emit("before_provider_request");

      const errorMsg = {
        role: "assistant",
        provider: "openai-2",
        model: "gpt-6.1-sol",
        stopReason: "error",
        errorMessage: "OpenAI API error (429): Rate limit reached for gpt-6.1-sol",
        content: [],
      };
      await h.emit("message_end", { message: errorMsg });

      // Verify model was automatically switched to slot 3 (not falling back to slot 1)
      assert.equal(h.ctx.model.provider, "openai-3");
      assert.equal(h.ctx.model.id, "gpt-6.1-sol");

      const failoverNotice = h.notices.find((n) => n.text.includes("rate limits (HTTP 429)"));
      assert.ok(failoverNotice, "Expected failover notification to user");
      assert.match(failoverNotice.text, /switched to OpenAI #3/i);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("slash commands /openai-status, /openai-switch, and /openai-add", async () => {
    const tempDir = join(tmpdir(), `pi-test-cmds-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });

    try {
      const authContent = {
        openai: { type: "oauth", access: makeJwt({ sub: "user-primary" }), refresh: "ref1", expires: Date.now() + 3600000 },
        "openai-2": { type: "oauth", access: makeJwt({ sub: "user-secondary" }), refresh: "ref2", expires: Date.now() + 3600000 },
      };
      writeFileSync(join(tempDir, "auth.json"), JSON.stringify(authContent));

      const h = createHarness({ model: { id: "gpt-6.1-sol", provider: "openai", api: "openai-responses" } });
      const native = createMockNativeProvider();

      const mockFetch = async () => ({
        ok: true,
        json: async () => ({ email: "alice@example.com" }),
      });

      await mod.default(h.pi, { native, agentDir: tempDir, fetchFn: mockFetch });

      // /openai-status
      await h.command("openai-status");
      const statusNotice = h.notices.at(-1);
      assert.match(statusNotice.text, /OpenAI Multi-Account Status:/);
      assert.match(statusNotice.text, /Slot 1 \(openai\) \[ACTIVE\]/);
      assert.match(statusNotice.text, /Slot 2 \(openai-2\)/);

      // /openai-switch (toggles between slot 1 and slot 2)
      await h.command("openai-switch");
      assert.equal(h.ctx.model.provider, "openai-2");
      assert.match(h.notices.at(-1).text, /Switched to OpenAI #2/);

      // Switch back
      await h.command("openai-switch");
      assert.equal(h.ctx.model.provider, "openai");
      assert.match(h.notices.at(-1).text, /Switched to OpenAI #1/);

      // /openai-add registers slot 3
      assert.equal(h.registeredProviders.has("openai-3"), false);
      await h.command("openai-add");
      assert.ok(h.registeredProviders.has("openai-3"));
      assert.match(h.notices.at(-1).text, /OpenAI slot 3 registered/);

      // /openai-remove 3 unenrolls slot 3
      await h.command("openai-remove", "3");
      assert.match(h.notices.at(-1).text, /OpenAI #3 \(openai-3\) unenrolled and removed/);

      // test with "openai -3" syntax
      await h.command("openai-add");
      assert.ok(h.registeredProviders.has("openai-3"));
      await h.command("openai-remove", "openai -3");
      assert.match(h.notices.at(-1).text, /OpenAI #3 \(openai-3\) unenrolled and removed/);

      // /openai-remove 2 logs out slot 2 and removes credential from auth.json
      assert.ok(mod.readCredentials(tempDir).has(2));
      await h.command("openai-remove", "2");
      assert.match(h.notices.at(-1).text, /OpenAI #2 \(openai-2\) logged out/);
      assert.equal(mod.readCredentials(tempDir).has(2), false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
