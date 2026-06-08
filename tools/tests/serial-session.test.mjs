import test from "node:test";
import assert from "node:assert/strict";
import { SerialSession } from "../../src/ui/terminals/serial-session.js";
import { EventBus } from "../../src/core/event-bus.js";
import { Topics } from "../../src/core/event-bus-topics.js";

function makeMockSerialManager() {
  const sent = [];
  return {
    connected: false,
    sent,
    async send(bytes) { sent.push(new Uint8Array(bytes)); },
  };
}

test("SerialSession: sendRaw on SerialSession calls serialManager.send(bytes) with exact bytes", async () => {
  const mgr = makeMockSerialManager();
  const session = new SerialSession({ serialManager: mgr });
  const bytes = new Uint8Array([0x41, 0x42, 0x43]);
  await session.sendRaw(bytes);
  assert.equal(mgr.sent.length, 1);
  assert.deepEqual(mgr.sent[0], bytes);
});

test("SerialSession: sendLine('hello') encodes 'hello\\r\\n' and calls sendRaw", async () => {
  const mgr = makeMockSerialManager();
  const session = new SerialSession({ serialManager: mgr });
  await session.sendLine("hello");
  assert.equal(mgr.sent.length, 1);
  const decoded = new TextDecoder().decode(mgr.sent[0]);
  assert.equal(decoded, "hello\r\n");
});

test("SerialSession: send('hello') delegates to sendLine", async () => {
  const mgr = makeMockSerialManager();
  const session = new SerialSession({ serialManager: mgr });
  await session.send("hello");
  assert.equal(mgr.sent.length, 1);
  const decoded = new TextDecoder().decode(mgr.sent[0]);
  assert.equal(decoded, "hello\r\n");
});

test("SerialSession: channelId returns 'serial'", () => {
  const mgr = makeMockSerialManager();
  const session = new SerialSession({ serialManager: mgr });
  assert.equal(session.channelId, "serial");
});

test("SerialSession: isReady returns _serialManager.connected value", () => {
  const mgr = makeMockSerialManager();
  mgr.connected = true;
  const session = new SerialSession({ serialManager: mgr });
  assert.equal(session.isReady(), true);
  mgr.connected = false;
  assert.equal(session.isReady(), false);
});

test("SerialSession: init subscribes to SERIAL_DATA, SERIAL_CONNECTED, SERIAL_DISCONNECTED", () => {
  const mgr = makeMockSerialManager();
  const session = new SerialSession({ serialManager: mgr });
  const bus = new EventBus();
  const cleanup = session.init({ bus, onData: () => {}, onReadyChange: () => {} });
  assert.equal(bus._topics.get(Topics.SERIAL_DATA)?.size, 1);
  assert.equal(bus._topics.get(Topics.SERIAL_CONNECTED)?.size, 1);
  assert.equal(bus._topics.get(Topics.SERIAL_DISCONNECTED)?.size, 1);
  cleanup();
});

test("SerialSession: init cleanup unsubscribes all bus listeners", () => {
  const mgr = makeMockSerialManager();
  const session = new SerialSession({ serialManager: mgr });
  const bus = new EventBus();
  const cleanup = session.init({ bus, onData: () => {}, onReadyChange: () => {} });
  assert.equal(bus._topics.get(Topics.SERIAL_DATA)?.size, 1);
  cleanup();
  assert.equal(bus._topics.get(Topics.SERIAL_DATA)?.size || 0, 0);
  assert.equal(bus._topics.get(Topics.SERIAL_CONNECTED)?.size || 0, 0);
  assert.equal(bus._topics.get(Topics.SERIAL_DISCONNECTED)?.size || 0, 0);
});

test("SerialSession: SERIAL_DATA event first chunk prepends newline", () => {
  const mgr = makeMockSerialManager();
  const session = new SerialSession({ serialManager: mgr });
  const bus = new EventBus();
  const received = [];
  session.init({ bus, onData: (bytes) => received.push(new Uint8Array(bytes)), onReadyChange: () => {} });
  bus.emit(Topics.SERIAL_DATA, { bytes: new Uint8Array([0x41, 0x42]) });
  assert.equal(received.length, 2);
  assert.equal(received[0][0], 0x0a);
  assert.equal(received[1][0], 0x41);
});

test("SerialSession: SERIAL_DATA event subsequent chunks do NOT prepend newline", () => {
  const mgr = makeMockSerialManager();
  const session = new SerialSession({ serialManager: mgr });
  const bus = new EventBus();
  const received = [];
  session.init({ bus, onData: (bytes) => received.push(new Uint8Array(bytes)), onReadyChange: () => {} });
  bus.emit(Topics.SERIAL_DATA, { bytes: new Uint8Array([0x41]) });
  bus.emit(Topics.SERIAL_DATA, { bytes: new Uint8Array([0x42]) });
  assert.equal(received.length, 3);
  assert.equal(received[0][0], 0x0a, "first emit: newline prepended");
  assert.equal(received[1][0], 0x41, "first emit: data chunk");
  assert.equal(received[2][0], 0x42, "second emit: no newline, just data");
});

test("SerialSession: SERIAL_CONNECTED event resets _firstChunk and calls onReadyChange", () => {
  const mgr = makeMockSerialManager();
  const session = new SerialSession({ serialManager: mgr });
  const bus = new EventBus();
  let readyCalls = 0;
  const received = [];
  session.init({ bus, onData: (bytes) => received.push(new Uint8Array(bytes)), onReadyChange: () => readyCalls++ });
  bus.emit(Topics.SERIAL_DATA, { bytes: new Uint8Array([0x41]) });
  assert.equal(received[0][0], 0x0a);
  bus.emit(Topics.SERIAL_CONNECTED);
  assert.equal(readyCalls, 1);
  bus.emit(Topics.SERIAL_DATA, { bytes: new Uint8Array([0x42]) });
  assert.equal(received[2][0], 0x0a);
});

test("SerialSession: SERIAL_DISCONNECTED event calls onReadyChange", () => {
  const mgr = makeMockSerialManager();
  const session = new SerialSession({ serialManager: mgr });
  const bus = new EventBus();
  let readyCalls = 0;
  session.init({ bus, onData: () => {}, onReadyChange: () => readyCalls++ });
  bus.emit(Topics.SERIAL_DISCONNECTED);
  assert.equal(readyCalls, 1);
});

test("SerialSession: SERIAL_DATA event null-safe on onData", () => {
  const mgr = makeMockSerialManager();
  const session = new SerialSession({ serialManager: mgr });
  const bus = new EventBus();
  session.init({ bus, onData: null, onReadyChange: null });
  assert.doesNotThrow(() => bus.emit(Topics.SERIAL_DATA, { bytes: new Uint8Array([1]) }));
  assert.doesNotThrow(() => bus.emit(Topics.SERIAL_CONNECTED));
  assert.doesNotThrow(() => bus.emit(Topics.SERIAL_DISCONNECTED));
});
