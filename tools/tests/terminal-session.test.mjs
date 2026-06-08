import test from "node:test";
import assert from "node:assert/strict";
import { TerminalSession } from "../../src/ui/terminals/terminal-session.js";

test("TerminalSession: channelId throws 'not implemented'", () => {
  const s = new TerminalSession();
  assert.throws(() => s.channelId, /not implemented/);
});

test("TerminalSession: isReady() returns false by default", () => {
  const s = new TerminalSession();
  assert.equal(s.isReady(), false);
});

test("TerminalSession: sendRaw(bytes) throws 'not implemented'", async () => {
  const s = new TerminalSession();
  await assert.rejects(() => s.sendRaw(new Uint8Array([1, 2, 3])), /not implemented/);
});

test("TerminalSession: sendLine('hello') calls sendRaw with utf-8 'hello\\r\\n'", async () => {
  let captured;
  class Stub extends TerminalSession {
    async sendRaw(bytes) { captured = new Uint8Array(bytes); }
  }
  const s = new Stub();
  await s.sendLine("hello");
  assert.equal(new TextDecoder().decode(captured), "hello\r\n");
});

test("TerminalSession: sendLine('') sends just '\\r\\n'", async () => {
  let captured;
  class Stub extends TerminalSession {
    async sendRaw(bytes) { captured = new Uint8Array(bytes); }
  }
  const s = new Stub();
  await s.sendLine("");
  assert.equal(new TextDecoder().decode(captured), "\r\n");
});

test("TerminalSession: sendLine encodes multi-byte UTF-8", async () => {
  let captured;
  class Stub extends TerminalSession {
    async sendRaw(bytes) { captured = new Uint8Array(bytes); }
  }
  const s = new Stub();
  await s.sendLine("héllo");
  const decoded = new TextDecoder().decode(captured);
  assert.ok(decoded.startsWith("héllo\r\n"));
  assert.equal(captured.length, new TextEncoder().encode("héllo\r\n").length);
});

test("TerminalSession: send('hello') delegates to sendLine", async () => {
  let captured;
  class Stub extends TerminalSession {
    async sendRaw(bytes) { captured = new Uint8Array(bytes); }
  }
  const s = new Stub();
  await s.send("hello");
  assert.equal(new TextDecoder().decode(captured), "hello\r\n");
});

test("TerminalSession: init() returns a no-op cleanup function", () => {
  const s = new TerminalSession();
  const cleanup = s.init({});
  assert.equal(typeof cleanup, "function");
  assert.doesNotThrow(() => cleanup());
});
