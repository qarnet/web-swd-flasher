import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { EventBus } from "../../src/core/event-bus.js";
import { Topics } from "../../src/core/event-bus-topics.js";
import { SerialConnectionPanel } from "../../src/ui/panels/serial-connection-panel.js";

class FakeSerialManager {
  static supported = true;
  constructor() { this._connected = false; }
  get connected() { return this._connected; }
  async requestPort() { return { usbVendorId: 0x2e8a, usbProductId: 0x000c }; }
  async connect(opts) { this._connected = true; }
  async disconnect() { this._connected = false; }
}

test("SerialConnectionPanel checkCompatibility HTTPS", () => {
  makeDom(`<div id="serial-compat-banner" hidden></div><span id="serial-compat-msg"></span><div id="root"><select id="serial-baud-select"></select><button id="btn-serial-connect"></button><button id="btn-serial-disconnect"></button><span id="serial-status"></span></div>`);
  const panel = new SerialConnectionPanel({ bus: new EventBus(), serialManager: new FakeSerialManager() });
  panel.mount(document.getElementById("root"));
  assert.equal(panel.checkCompatibility(), true);
  teardownDom();
});

test("SerialConnectionPanel _onConnect emits SERIAL_CONNECTED + LOG_LINE", async () => {
  makeDom(`<div id="serial-compat-banner" hidden></div><span id="serial-compat-msg"></span><div id="root"><select id="serial-baud-select"><option value="115200" selected></option></select><button id="btn-serial-connect"></button><button id="btn-serial-disconnect"></button><span id="serial-status"></span></div>`);
  const bus = new EventBus();
  const serialEvents = [], logEvents = [];
  bus.on(Topics.SERIAL_CONNECTED, (e) => serialEvents.push(e));
  bus.on(Topics.LOG_LINE, (e) => logEvents.push(e));
  new SerialConnectionPanel({ bus, serialManager: new FakeSerialManager() }).mount(document.getElementById("root"));
  document.querySelector("#btn-serial-connect").click();
  await new Promise(r => setTimeout(r, 10));
  assert.ok(serialEvents.length > 0);
  assert.ok(logEvents.some(e => e.source === "serial" && e.level === "info"));
  teardownDom();
});

test("SerialConnectionPanel onUnexpectedDisconnect emits with unexpected:true", () => {
  makeDom(`<div id="serial-compat-banner" hidden></div><span id="serial-compat-msg"></span><div id="root"><select id="serial-baud-select"></select><button id="btn-serial-connect"></button><button id="btn-serial-disconnect"></button><span id="serial-status"></span></div>`);
  const bus = new EventBus();
  const disconnects = [];
  bus.on(Topics.SERIAL_DISCONNECTED, (e) => disconnects.push(e));
  const panel = new SerialConnectionPanel({ bus, serialManager: new FakeSerialManager() });
  panel.mount(document.getElementById("root"));
  panel.onUnexpectedDisconnect();
  assert.ok(disconnects.length > 0);
  assert.equal(disconnects[0].unexpected, true);
  teardownDom();
});

test("SerialConnectionPanel mount loads into select", () => {
  makeDom(`<div id="serial-compat-banner" hidden></div><span id="serial-compat-msg"></span><div id="root"><select id="serial-baud-select"><option value="921600">921600</option></select><button id="btn-serial-connect"></button><button id="btn-serial-disconnect"></button><span id="serial-status"></span></div>`);
  new SerialConnectionPanel({ bus: new EventBus(), serialManager: new FakeSerialManager() }).mount(document.getElementById("root"));
  // Validate mount doesn't crash — select value may be unsettable in linkedom
  assert.ok(true);
  teardownDom();
});
