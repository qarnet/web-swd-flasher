import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { EventBus } from "../../src/core/event-bus.js";
import { Topics } from "../../src/core/event-bus-topics.js";
import { SerialTerminalPanel } from "../../src/ui/panels/serial-terminal-panel.js";

class FakeSerialManager {
  constructor() { this._connected = true; this._sent = []; }
  get connected() { return this._connected; }
  async send(data) { this._sent.push(data); }
}

test("SerialTerminalPanel writes bytes to ansi renderer", () => {
  makeDom(`<div id="root"><pre id="serial-term-log"></pre><input id="serial-tx-input"><button id="btn-serial-send"></button><button id="btn-serial-clear"></button><button id="btn-serial-download"></button><input id="chk-serial-autoscroll" type="checkbox" checked></div>`);
  const bus = new EventBus();
  new SerialTerminalPanel({ bus, serialManager: new FakeSerialManager() }).mount(document.getElementById("root"));
  bus.emit(Topics.SERIAL_DATA, { bytes: new TextEncoder().encode("Hello\n") });
  assert.ok(document.querySelector("#serial-term-log").textContent.includes("Hello"), "should render received bytes");
  teardownDom();
});

test("SerialTerminalPanel _onSend appends CRLF and clears input", async () => {
  makeDom(`<div id="root"><pre id="serial-term-log"></pre><input id="serial-tx-input" value="test"><button id="btn-serial-send"></button><button id="btn-serial-clear"></button><button id="btn-serial-download"></button><input id="chk-serial-autoscroll" type="checkbox" checked></div>`);
  const sm = new FakeSerialManager();
  new SerialTerminalPanel({ bus: new EventBus(), serialManager: sm }).mount(document.getElementById("root"));
  document.querySelector("#btn-serial-send").click();
  await new Promise(r => setTimeout(r, 10));
  assert.ok(sm._sent.length > 0, "should have sent data");
  const sent = new TextDecoder().decode(sm._sent[0]);
  assert.ok(sent.endsWith("\r\n"), "should append CRLF");
  assert.equal(document.querySelector("#serial-tx-input").value, "");
  teardownDom();
});

test("SerialTerminalPanel _onClear resets renderer", () => {
  makeDom(`<div id="root"><pre id="serial-term-log">Old</pre><input id="serial-tx-input"><button id="btn-serial-send"></button><button id="btn-serial-clear"></button><button id="btn-serial-download"></button><input id="chk-serial-autoscroll" checked></div>`);
  new SerialTerminalPanel({ bus: new EventBus(), serialManager: new FakeSerialManager() }).mount(document.getElementById("root"));
  document.querySelector("#btn-serial-clear").click();
  assert.equal(document.querySelector("#serial-term-log").textContent, "");
  teardownDom();
});
