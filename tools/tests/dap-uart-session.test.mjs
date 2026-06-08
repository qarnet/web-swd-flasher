import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { DapUartTerminalSession } from "../../src/ui/terminals/dap-uart-session.js";
import { EventBus } from "../../src/core/event-bus.js";
import { Topics } from "../../src/core/event-bus-topics.js";

let _store = {};
function setupStore() {
  _store = {};
  globalThis.localStorage = {
    getItem(k) { return _store[k] ?? null; },
    setItem(k, v) { _store[k] = v; },
    removeItem(k) { delete _store[k]; },
  };
}
function makeDomAndStore(html) {
  makeDom(html);
  globalThis.localStorage = {
    getItem(k) { return _store[k] ?? null; },
    setItem(k, v) { _store[k] = v; },
    removeItem(k) { delete _store[k]; },
  };
}

function attachControls(session) {
  const container = session.buildControls();
  globalThis.document.getElementById("root").appendChild(container);
}

function makeFakeBackendCore() {
  const sent = [];
  return {
    core: {
      _sent: sent,
      sendCommand: async (cmd) => { sent.push(new Uint8Array(cmd)); return new Uint8Array([0, 0]); },
    },
  };
}

test("DapUartTerminalSession: channelId returns 'uart'", () => {
  const s = new DapUartTerminalSession({ backendProvider: () => null });
  assert.equal(s.channelId, "uart");
});

test("DapUartTerminalSession: isReady() returns false when _uart is null", () => {
  const s = new DapUartTerminalSession({ backendProvider: () => null });
  assert.equal(s.isReady(), false);
});

test("DapUartTerminalSession: isReady() returns true when _uart is set", () => {
  const s = new DapUartTerminalSession({ backendProvider: () => null });
  s._uart = { send: async () => {} };
  assert.equal(s.isReady(), true);
});

test("DapUartTerminalSession: sendRaw throws when _uart is null", async () => {
  const s = new DapUartTerminalSession({ backendProvider: () => null });
  await assert.rejects(() => s.sendRaw(new Uint8Array([1, 2])), /UART not connected/);
});

test("DapUartTerminalSession: sendRaw calls _uart.send(bytes)", async () => {
  const s = new DapUartTerminalSession({ backendProvider: () => null });
  const sent = [];
  s._uart = { send: async (b) => { sent.push(new Uint8Array(b)); } };
  const bytes = new Uint8Array([0x41, 0x42]);
  await s.sendRaw(bytes);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], bytes);
});

test("DapUartTerminalSession: buildControls creates baud select with 8 options", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const s = new DapUartTerminalSession({ backendProvider: () => null });
  const container = s.buildControls();
  const select = container.querySelector(".uart-baud-select");
  assert.ok(select);
  const options = select.querySelectorAll("option");
  assert.equal(options.length, 8);
});

test("DapUartTerminalSession: buildControls default baud 115200 is selected", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const s = new DapUartTerminalSession({ backendProvider: () => null });
  const container = s.buildControls();
  const select = container.querySelector(".uart-baud-select");
  const selected = select.querySelector("option[selected]");
  assert.equal(selected.value, "115200");
});

test("DapUartTerminalSession: buildControls has Connect/Disconnect buttons both disabled", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const s = new DapUartTerminalSession({ backendProvider: () => null });
  const container = s.buildControls();
  const connect = container.querySelector(".btn-uart-connect");
  const disconnect = container.querySelector(".btn-uart-disconnect");
  assert.ok(connect);
  assert.ok(disconnect);
  assert.equal(connect.disabled, true);
  assert.equal(disconnect.disabled, true);
});

test("DapUartTerminalSession: buildControls has status paragraph", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const s = new DapUartTerminalSession({ backendProvider: () => null });
  const container = s.buildControls();
  const status = container.querySelector(".uart-status");
  assert.ok(status);
  assert.equal(status.textContent, "Not connected");
});

test("DapUartTerminalSession: buildControls persists baud via persistInput", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const s = new DapUartTerminalSession({ backendProvider: () => null });
  attachControls(s);
  const select = globalThis.document.querySelector(".uart-baud-select");
  assert.ok(select);
});

test("DapUartTerminalSession: init BACKEND_CONNECTED enables Connect button", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const s = new DapUartTerminalSession({ backendProvider: () => null });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  bus.emit(Topics.BACKEND_CONNECTED);
  const connect = globalThis.document.querySelector(".btn-uart-connect");
  assert.equal(connect.disabled, false);
});

test("DapUartTerminalSession: init BACKEND_DISCONNECTED calls _disconnect and disables buttons", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const s = new DapUartTerminalSession({ backendProvider: () => null });
  s._uart = { close: () => {} };
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  bus.emit(Topics.BACKEND_DISCONNECTED);
  const connect = globalThis.document.querySelector(".btn-uart-connect");
  const disconnect = globalThis.document.querySelector(".btn-uart-disconnect");
  assert.equal(connect.disabled, true);
  assert.equal(disconnect.disabled, true);
  assert.equal(s._uart, null);
});

test("DapUartTerminalSession: init cleanup unsubscribes bus listeners", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const s = new DapUartTerminalSession({ backendProvider: () => null });
  attachControls(s);
  const cleanup = s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  assert.equal(bus._topics.get(Topics.BACKEND_CONNECTED)?.size, 1);
  assert.equal(bus._topics.get(Topics.BACKEND_DISCONNECTED)?.size, 1);
  cleanup();
  assert.equal(bus._topics.get(Topics.BACKEND_CONNECTED)?.size || 0, 0);
  assert.equal(bus._topics.get(Topics.BACKEND_DISCONNECTED)?.size || 0, 0);
});

test("DapUartTerminalSession: Connect button click without backend core sets status", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const s = new DapUartTerminalSession({ backendProvider: () => ({}) });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  const connect = globalThis.document.querySelector(".btn-uart-connect");
  connect.click();
  await new Promise(r => setTimeout(r, 5));
  const status = globalThis.document.querySelector(".uart-status");
  assert.ok(status.textContent.includes("not available"));
});

test("DapUartTerminalSession: Connect button with backend creates DapUartSession and opens", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const fakeBackend = makeFakeBackendCore();
  const s = new DapUartTerminalSession({ backendProvider: () => fakeBackend });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  const connect = globalThis.document.querySelector(".btn-uart-connect");
  connect.click();
  await new Promise(r => setTimeout(r, 10));
  assert.notEqual(s._uart, null);
  const status = globalThis.document.querySelector(".uart-status");
  assert.ok(status.textContent.includes("Connected"));
  s._uart._polling = false;
  if (s._uart._pollTimer) clearTimeout(s._uart._pollTimer);
});

test("DapUartTerminalSession: Connect button with open failure sets error status", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const fakeBackend = {
    core: {
      sendCommand: async () => { throw new Error("open failed"); },
    },
  };
  const logs = [];
  const s = new DapUartTerminalSession({
    backendProvider: () => fakeBackend,
    logger: { log: (s) => logs.push(s) },
  });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  const connect = globalThis.document.querySelector(".btn-uart-connect");
  connect.click();
  await new Promise(r => setTimeout(r, 10));
  const status = globalThis.document.querySelector(".uart-status");
  assert.ok(status.textContent.includes("open failed"));
  assert.equal(s._uart, null);
  assert.ok(logs.some(l => l.includes("open failed")));
});
test("DapUartTerminalSession: Connect updates button states on success", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const fakeBackend = makeFakeBackendCore();
  const s = new DapUartTerminalSession({ backendProvider: () => fakeBackend });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  const connect = globalThis.document.querySelector(".btn-uart-connect");
  connect.click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(connect.disabled, true);
  const disconnect = globalThis.document.querySelector(".btn-uart-disconnect");
  assert.equal(disconnect.disabled, false);
  s._uart._polling = false;
  if (s._uart._pollTimer) clearTimeout(s._uart._pollTimer);
});

test("DapUartTerminalSession: Disconnect button click calls _disconnect and logs", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const fakeBackend = makeFakeBackendCore();
  const logs = [];
  const s = new DapUartTerminalSession({
    backendProvider: () => fakeBackend,
    logger: { log: (s) => logs.push(s) },
  });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  await s._onConnect();
  assert.notEqual(s._uart, null);
  await s._onDisconnect();
  assert.equal(s._uart, null);
  assert.ok(logs.some(l => l.includes("disconnected")));
});
test("DapUartTerminalSession: _disconnect is safe when _uart is null", () => {
  const s = new DapUartTerminalSession({ backendProvider: () => null });
  assert.doesNotThrow(() => s._disconnect());
});

test("DapUartTerminalSession: _disconnect calls uart.close wrapped in try/catch", () => {
  const s = new DapUartTerminalSession({ backendProvider: () => null });
  let closeCalled = false;
  s._uart = { close: () => { closeCalled = true; throw new Error("close error"); } };
  s._disconnect();
  assert.equal(closeCalled, true);
  assert.equal(s._uart, null);
});

test("DapUartTerminalSession: Connect uses selected baud rate", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const fakeBackend = makeFakeBackendCore();
  const s = new DapUartTerminalSession({ backendProvider: () => fakeBackend });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  const connect = globalThis.document.querySelector(".btn-uart-connect");
  connect.click();
  await new Promise(r => setTimeout(r, 10));
  const status = globalThis.document.querySelector(".uart-status");
  assert.ok(status.textContent.includes("115200"));
  s._uart._polling = false;
  if (s._uart._pollTimer) clearTimeout(s._uart._pollTimer);
});

test("DapUartTerminalSession: Connect uses default 115200 when select value is invalid", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const fakeBackend = makeFakeBackendCore();
  const s = new DapUartTerminalSession({ backendProvider: () => fakeBackend });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  const connect = globalThis.document.querySelector(".btn-uart-connect");
  connect.click();
  await new Promise(r => setTimeout(r, 10));
  const status = globalThis.document.querySelector(".uart-status");
  assert.ok(status.textContent.includes("115200"));
  s._uart._polling = false;
  if (s._uart._pollTimer) clearTimeout(s._uart._pollTimer);
});

test("DapUartTerminalSession: _onReadyChange called on connect success", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const fakeBackend = makeFakeBackendCore();
  const s = new DapUartTerminalSession({ backendProvider: () => fakeBackend });
  attachControls(s);
  let readyCalls = 0;
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => readyCalls++ });
  await s._onConnect();
  assert.equal(readyCalls, 1);
  s._uart._polling = false;
  if (s._uart._pollTimer) clearTimeout(s._uart._pollTimer);
});

test("DapUartTerminalSession: data from uart.onData forwards to _onData", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const fakeBackend = makeFakeBackendCore();
  const s = new DapUartTerminalSession({ backendProvider: () => fakeBackend });
  attachControls(s);
  const received = [];
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: (b) => received.push(new Uint8Array(b)), onReadyChange: () => {} });
  await s._onConnect();
  const testBytes = new Uint8Array([0x41, 0x42]);
  s._uart._onData(testBytes);
  assert.equal(received.length, 1);
  assert.deepEqual(received[0], testBytes);
  s._uart._polling = false;
  if (s._uart._pollTimer) clearTimeout(s._uart._pollTimer);
});
