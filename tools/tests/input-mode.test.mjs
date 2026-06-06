import test from "node:test";
import assert from "node:assert/strict";
import { RawInputMode } from "../../src/ui/terminals/input-mode.js";

function makeMockSession(ready = true) {
  const sent = [];
  return {
    sent,
    isReady() { return ready; },
    async sendRaw(bytes) { sent.push(new Uint8Array(bytes)); },
  };
}

test("RawInputMode.handle() calls session.sendRaw() with encoded bytes", () => {
  const session = makeMockSession(true);
  const mode = new RawInputMode(session);
  mode.handle("hello");
  assert.equal(session.sent.length, 1);
  const decoded = new TextDecoder().decode(session.sent[0]);
  assert.equal(decoded, "hello");
});

test("RawInputMode.handle() is a no-op when session.isReady() returns false", () => {
  const session = makeMockSession(false);
  const mode = new RawInputMode(session);
  mode.handle("hello");
  assert.equal(session.sent.length, 0);
});
