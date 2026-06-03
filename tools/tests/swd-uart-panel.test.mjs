import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { EventBus } from "../../src/core/event-bus.js";
import { Topics } from "../../src/core/event-bus-topics.js";
import { SwdUartPanel } from "../../src/ui/panels/swd-uart-panel.js";

const FRAGMENT = `<div id="root">
  <select id="uart-baud-select"><option value="115200" selected>115200</option><option value="9600">9600</option></select>
  <button id="btn-uart-connect"></button>
  <button id="btn-uart-disconnect"></button>
  <button id="btn-uart-clear"></button>
  <button id="btn-uart-download"></button>
  <input id="uart-tx-input" />
  <button id="btn-uart-send"></button>
  <input id="chk-uart-autoscroll" type="checkbox" checked />
  <span id="uart-status"></span>
  <pre id="uart-log"></pre>
</div>`;

// Fake core whose sendCommand always succeeds (resp[1]=0x00).
function makeFakeCore({ throws } = {}) {
  const calls = [];
  return {
    calls,
    sendCommand: async (payload) => {
      calls.push(Array.from(payload));
      if (throws) throw new Error(throws);
      const r = new Uint8Array(64);
      r[0] = payload[0];
      r[1] = 0x00;
      return r;
    },
  };
}

test("SwdUartPanel buttons start disabled", () => {
  makeDom(FRAGMENT);
  new SwdUartPanel({ bus: new EventBus(), backendProvider: () => ({}), logger: { log: () => {} } }).mount(document.getElementById("root"));
  assert.equal(document.querySelector("#btn-uart-connect").disabled, true);
  assert.equal(document.querySelector("#btn-uart-disconnect").disabled, true);
  teardownDom();
});

test("SwdUartPanel connect enables on BACKEND_CONNECTED", () => {
  makeDom(FRAGMENT);
  const bus = new EventBus();
  new SwdUartPanel({ bus, backendProvider: () => ({}), logger: { log: () => {} } }).mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  assert.equal(document.querySelector("#btn-uart-connect").disabled, false);
  assert.equal(document.querySelector("#btn-uart-disconnect").disabled, true);
  teardownDom();
});

test("SwdUartPanel both buttons disable on BACKEND_DISCONNECTED", () => {
  makeDom(FRAGMENT);
  const bus = new EventBus();
  new SwdUartPanel({ bus, backendProvider: () => ({}), logger: { log: () => {} } }).mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  bus.emit(Topics.BACKEND_DISCONNECTED);
  assert.equal(document.querySelector("#btn-uart-connect").disabled, true);
  assert.equal(document.querySelector("#btn-uart-disconnect").disabled, true);
  teardownDom();
});

test("SwdUartPanel shows not-available when backend has no core", async () => {
  makeDom(FRAGMENT);
  const bus = new EventBus();
  // backend returns no .core property
  const panel = new SwdUartPanel({ bus, backendProvider: () => ({ core: null }), logger: { log: () => {} } });
  panel.mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  document.querySelector("#btn-uart-connect").click();
  await new Promise(r => setTimeout(r, 20));
  assert.ok(document.querySelector("#uart-status").textContent.includes("not available"), "should show not available");
  teardownDom();
});

test("SwdUartPanel connect happy path updates status and button state", async () => {
  makeDom(FRAGMENT);
  const bus = new EventBus();
  const core = makeFakeCore();
  const panel = new SwdUartPanel({ bus, backendProvider: () => ({ core }), logger: { log: () => {} } });
  panel.mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  document.querySelector("#btn-uart-connect").click();
  await new Promise(r => setTimeout(r, 30));
  const status = document.querySelector("#uart-status").textContent;
  assert.ok(status.includes("Connected") && status.includes("115200"), `status="${status}"`);
  assert.equal(document.querySelector("#btn-uart-connect").disabled, true);
  assert.equal(document.querySelector("#btn-uart-disconnect").disabled, false);
  // Stop polling timer before teardown
  panel._disconnectUart();
  teardownDom();
});

test("SwdUartPanel connect error path shows error in status", async () => {
  makeDom(FRAGMENT);
  const bus = new EventBus();
  const core = makeFakeCore({ throws: "probe disconnected" });
  const panel = new SwdUartPanel({ bus, backendProvider: () => ({ core }), logger: { log: () => {} } });
  panel.mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  document.querySelector("#btn-uart-connect").click();
  await new Promise(r => setTimeout(r, 30));
  const status = document.querySelector("#uart-status").textContent;
  assert.ok(status.toLowerCase().includes("failed") || status.includes("probe disconnected"), `status="${status}"`);
  // connect button should be re-enabled (not left in disabled state after error)
  assert.equal(document.querySelector("#btn-uart-connect").disabled, false);
  teardownDom();
});

test("SwdUartPanel disconnect resets status and button state", async () => {
  makeDom(FRAGMENT);
  const bus = new EventBus();
  const core = makeFakeCore();
  const panel = new SwdUartPanel({ bus, backendProvider: () => ({ core }), logger: { log: () => {} } });
  panel.mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  document.querySelector("#btn-uart-connect").click();
  await new Promise(r => setTimeout(r, 30));
  document.querySelector("#btn-uart-disconnect").click();
  await new Promise(r => setTimeout(r, 10));
  assert.ok(document.querySelector("#uart-status").textContent.includes("Disconnected"));
  assert.equal(document.querySelector("#btn-uart-connect").disabled, false);
  assert.equal(document.querySelector("#btn-uart-disconnect").disabled, true);
  teardownDom();
});

test("SwdUartPanel clear empties the log", async () => {
  makeDom(FRAGMENT);
  const bus = new EventBus();
  const core = makeFakeCore();
  const panel = new SwdUartPanel({ bus, backendProvider: () => ({ core }), logger: { log: () => {} } });
  panel.mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  // Inject content into log directly
  document.querySelector("#uart-log").textContent = "some previous output";
  document.querySelector("#btn-uart-clear").click();
  assert.equal(document.querySelector("#uart-log").textContent, "");
  panel._disconnectUart();
  teardownDom();
});

test("SwdUartPanel send transmits text and clears input", async () => {
  makeDom(FRAGMENT);
  const bus = new EventBus();
  const sentPayloads = [];
  const core = {
    sendCommand: async (payload) => {
      sentPayloads.push(Array.from(payload));
      const r = new Uint8Array(64);
      r[0] = payload[0];
      r[1] = 0x00;
      return r;
    },
  };
  const panel = new SwdUartPanel({ bus, backendProvider: () => ({ core }), logger: { log: () => {} } });
  panel.mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  document.querySelector("#btn-uart-connect").click();
  await new Promise(r => setTimeout(r, 30));
  // Now send a message
  document.querySelector("#uart-tx-input").value = "hello";
  document.querySelector("#btn-uart-send").click();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(document.querySelector("#uart-tx-input").value, "", "input should be cleared after send");
  // Transfer command 0x21 should have been sent
  const transferCalls = sentPayloads.filter(p => p[0] === 0x21);
  assert.ok(transferCalls.length > 0, "expected DAP_UART_Transfer (0x21) to be sent");
  panel._disconnectUart();
  teardownDom();
});
