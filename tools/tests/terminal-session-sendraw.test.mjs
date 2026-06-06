import test from "node:test";
import assert from "node:assert/strict";
import { SerialSession } from "../../src/ui/terminals/serial-session.js";

function makeMockSerialManager() {
  const sent = [];
  return {
    connected: false,
    sent,
    async send(bytes) { sent.push(new Uint8Array(bytes)); },
  };
}

test("sendRaw on SerialSession calls serialManager.send(bytes) with exact bytes", async () => {
  const mgr = makeMockSerialManager();
  const session = new SerialSession({ serialManager: mgr });
  const bytes = new Uint8Array([0x41, 0x42, 0x43]);
  await session.sendRaw(bytes);
  assert.equal(mgr.sent.length, 1);
  assert.deepEqual(mgr.sent[0], bytes);
});

test("sendLine('hello') encodes 'hello\\r\\n' and calls sendRaw", async () => {
  const mgr = makeMockSerialManager();
  const session = new SerialSession({ serialManager: mgr });
  await session.sendLine("hello");
  assert.equal(mgr.sent.length, 1);
  const decoded = new TextDecoder().decode(mgr.sent[0]);
  assert.equal(decoded, "hello\r\n");
});

test("send('hello') delegates to sendLine", async () => {
  const mgr = makeMockSerialManager();
  const session = new SerialSession({ serialManager: mgr });
  await session.send("hello");
  assert.equal(mgr.sent.length, 1);
  const decoded = new TextDecoder().decode(mgr.sent[0]);
  assert.equal(decoded, "hello\r\n");
});
