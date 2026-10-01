import assert from "node:assert/strict";
import test from "node:test";
import usageLimits from "../extensions/usage-limits.ts";

// No provider calls, credentials, or real compaction: exercise the registered
// lifecycle handler with the manual-compaction callback contract.
function fixture() {
  const handlers = new Map();
  const messages = [];
  const compactions = [];
  let tokens = 150_000;
  let sessionId = "session-a";
  let pending = false;
  let idle = true;
  const pi = {
    on: (name, handler) => handlers.set(name, handler),
    registerCommand() {},
    sendMessage: (...args) => messages.push(args),
  };
  const ctx = {
    hasUI: false,
    getContextUsage: () => ({ tokens }),
    sessionManager: { getSessionId: () => sessionId },
    hasPendingMessages: () => pending,
    isIdle: () => idle,
    compact: (options) => compactions.push(options),
  };
  usageLimits(pi);
  return {
    handlers, messages, compactions, ctx,
    turn: (overrides = {}) => handlers.get("turn_end")({
      outcome: "completed", context: { canContinue: true }, ...overrides,
    }, ctx),
    setTokens: (value) => { tokens = value; },
    setSession: (value) => { sessionId = value; },
    setPending: () => { pending = true; },
    setBusy: () => { idle = false; },
  };
}

test("successful compaction resumes runnable work once, without a user message", () => {
  const f = fixture();
  f.turn();
  f.turn(); // Suppress concurrent attempts.
  assert.equal(f.compactions.length, 1);
  assert.equal(f.messages.length, 0);
  f.compactions[0].onComplete({});
  assert.equal(f.messages.length, 1);
  const [message, options] = f.messages[0];
  assert.equal(message.customType, "context-compaction-resume");
  assert.equal(message.display, false);
  assert.deepEqual(options, { triggerTurn: true, deliverAs: "followUp" });
  f.setTokens(20_000);
  f.turn();
  assert.equal(f.compactions.length, 1);
});

for (const tokens of [149_999, null, undefined]) {
  test(`does not compact at ${tokens} tokens`, () => {
    const f = fixture();
    f.setTokens(tokens);
    f.turn();
    assert.equal(f.compactions.length, 0);
  });
}

for (const outcome of ["aborted", "error"]) {
  test(`does not compact or restart a ${outcome} turn`, () => {
    const f = fixture();
    f.turn({ outcome });
    assert.equal(f.compactions.length, 0);
    assert.equal(f.messages.length, 0);
  });
}

test("compacts a final answer without starting more work", () => {
  const f = fixture();
  f.turn({ context: { canContinue: false } });
  f.compactions[0].onComplete({});
  assert.equal(f.messages.length, 0);
});

test("failed or cancelled compaction does not resume and releases the guard", () => {
  const f = fixture();
  f.turn();
  f.compactions[0].onError(new Error("Compaction cancelled"));
  assert.equal(f.messages.length, 0);
  f.turn();
  assert.equal(f.compactions.length, 2);
});

for (const change of ["session", "shutdown", "pending", "busy"]) {
  test(`no stale or competing continuation after ${change}`, () => {
    const f = fixture();
    f.turn();
    if (change === "session") f.setSession("session-b");
    if (change === "shutdown") f.handlers.get("session_shutdown")();
    if (change === "pending") f.setPending();
    if (change === "busy") f.setBusy();
    f.compactions[0].onComplete({});
    assert.equal(f.messages.length, 0);
  });
}
