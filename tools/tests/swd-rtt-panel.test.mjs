import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { makeFakeBackend } from "./helpers/fake-backend.mjs";
import { EventBus } from "../../src/core/event-bus.js";
import { Topics } from "../../src/core/event-bus-topics.js";
import { SwdRttPanel } from "../../src/ui/panels/swd-rtt-panel.js";

const FRAGMENT = `<div id="root">
  <input id="rtt-ram-start" value="0x20000000"><input id="rtt-ram-size" value="256"><input id="rtt-interval" value="50">
  <button id="btn-rtt-search" disabled>Search</button><button id="btn-rtt-start" disabled>Start</button><button id="btn-rtt-stop" disabled>Stop</button>
  <button id="btn-rtt-clear">Clear</button><button id="btn-rtt-download" disabled>Download</button>
  <input id="chk-rtt-autoscroll" type="checkbox" checked>
  <p id="rtt-status"></p><pre id="rtt-log"></pre>
  <input id="rtt-tx-input" disabled><button id="btn-rtt-send" disabled>Send</button>
</div>`;

class FakeRttClient {
  constructor() {
    this._upChannels = [];
    this._downChannels = [];
    this._controlBlockAddr = 0x20004000;
    this._listeners = {};
    this._polling = false;
    this._sent = [];
  }
  get controlBlockAddr() { return this._controlBlockAddr; }
  get upChannelCount() { return this._upChannels.length; }
  get downChannelCount() { return this._downChannels.length; }
  async search(ramStart, ramSize) { return true; }
  removeAllListeners() { this._listeners = {}; return this; }
  on(evt, fn) { this._listeners[evt] = fn; return this; }
  startPolling(ms) { this._polling = true; }
  stop() { this._polling = false; }
  async write(ch, data) { this._sent.push({ ch, data }); }
}

test("SwdRttPanel buttons start disabled", () => {
  makeDom(FRAGMENT);
  new SwdRttPanel({ bus: new EventBus(), backendProvider: () => makeFakeBackend(), logger: { log: () => {} } }).mount(document.getElementById("root"));
  assert.equal(document.querySelector("#btn-rtt-search").disabled, true);
  assert.equal(document.querySelector("#btn-rtt-start").disabled, true);
  assert.equal(document.querySelector("#btn-rtt-stop").disabled, true);
  assert.equal(document.querySelector("#btn-rtt-download").disabled, true);
  teardownDom();
});

test("SwdRttPanel search enables start and tx when channels found", async () => {
  makeDom(FRAGMENT);
  const rttClient = new FakeRttClient();
  rttClient._upChannels.push({ pBuffer: 0, size: 256, wrOff: 0, rdOff: 0 });
  rttClient._downChannels.push({ pBuffer: 0, size: 64, wrOff: 0, rdOff: 0 });

  const bus = new EventBus();
  new SwdRttPanel({ bus, backendProvider: () => makeFakeBackend({ rttSession: rttClient }), logger: { log: () => {} } }).mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});

  document.querySelector("#btn-rtt-search").click();
  await new Promise(r => setTimeout(r, 20));

  assert.ok(document.querySelector("#rtt-status").textContent.includes("1 up"), "should show up channel count");
  assert.ok(document.querySelector("#rtt-status").textContent.includes("1 down"), "should show down channel count");
  assert.equal(document.querySelector("#btn-rtt-start").disabled, false);
  assert.equal(document.querySelector("#rtt-tx-input").disabled, false);
  assert.equal(document.querySelector("#btn-rtt-send").disabled, false);
  teardownDom();
});

test("SwdRttPanel search not-found shows message", async () => {
  makeDom(FRAGMENT);
  const rttClient = new FakeRttClient();
  rttClient.search = async () => false;

  const bus = new EventBus();
  new SwdRttPanel({ bus, backendProvider: () => makeFakeBackend({ rttSession: rttClient }), logger: { log: () => {} } }).mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});

  document.querySelector("#btn-rtt-search").click();
  await new Promise(r => setTimeout(r, 20));

  assert.ok(document.querySelector("#rtt-status").textContent.includes("not found"));
  assert.equal(document.querySelector("#btn-rtt-start").disabled, true);
  teardownDom();
});

test("SwdRttPanel start/stop toggles buttons", async () => {
  makeDom(FRAGMENT);
  const rttClient = new FakeRttClient();
  rttClient._upChannels.push({ pBuffer: 0, size: 256 });

  const bus = new EventBus();
  new SwdRttPanel({ bus, backendProvider: () => makeFakeBackend({ rttSession: rttClient }), logger: { log: () => {} } }).mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});

  document.querySelector("#btn-rtt-search").click();
  await new Promise(r => setTimeout(r, 20));
  document.querySelector("#btn-rtt-start").click();

  assert.equal(document.querySelector("#btn-rtt-start").disabled, true);
  assert.equal(document.querySelector("#btn-rtt-stop").disabled, false);

  document.querySelector("#btn-rtt-stop").click();
  assert.equal(document.querySelector("#btn-rtt-start").disabled, false);
  assert.equal(document.querySelector("#btn-rtt-stop").disabled, true);
  teardownDom();
});

test("SwdRttPanel _onSend writes channel 0", async () => {
  makeDom(FRAGMENT);
  const rttClient = new FakeRttClient();
  rttClient._upChannels.push({ pBuffer: 0, size: 256 });
  rttClient._downChannels.push({ pBuffer: 0, size: 64 });

  const bus = new EventBus();
  new SwdRttPanel({ bus, backendProvider: () => makeFakeBackend({ rttSession: rttClient }), logger: { log: () => {} } }).mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});

  document.querySelector("#btn-rtt-search").click();
  await new Promise(r => setTimeout(r, 20));

  document.querySelector("#rtt-tx-input").value = "hello";
  document.querySelector("#btn-rtt-send").click();
  await new Promise(r => setTimeout(r, 20));

  assert.ok(rttClient._sent.length > 0);
  assert.equal(rttClient._sent[0].ch, 0);
  const data = new TextDecoder().decode(rttClient._sent[0].data);
  assert.ok(data.includes("hello"));
  teardownDom();
});

test("SwdRttPanel BACKEND_DISCONNECTED stops client and disables", () => {
  makeDom(FRAGMENT);
  const rttClient = new FakeRttClient();
  rttClient._upChannels.push({ pBuffer: 0, size: 256 });

  const bus = new EventBus();
  new SwdRttPanel({ bus, backendProvider: () => makeFakeBackend({ rttSession: rttClient }), logger: { log: () => {} } }).mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});

  bus.emit(Topics.BACKEND_DISCONNECTED);
  assert.equal(rttClient._polling, false);
  assert.equal(document.querySelector("#btn-rtt-search").disabled, true);
  assert.equal(document.querySelector("#btn-rtt-start").disabled, true);
  teardownDom();
});
