import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { EventBus } from "../../src/core/event-bus.js";
import { Topics } from "../../src/core/event-bus-topics.js";
import { SerialTerminalPanel } from "../../src/ui/panels/serial-terminal-panel.js";

const FRAGMENT = `<div id="root"><pre id="serial-term-log"></pre><input id="serial-tx-input"><button id="btn-serial-send"></button><button id="btn-serial-clear"></button><button id="btn-serial-download"></button><input id="chk-serial-autoscroll" type="checkbox" checked><input id="chk-serial-cr-newline" type="checkbox" checked></div>`;

class FakeSerialManager {
  constructor() { this._connected = true; this._sent = []; }
  get connected() { return this._connected; }
  async send(data) { this._sent.push(data); }
}

async function flushPaint() {
  await new Promise(r => queueMicrotask(r));
}

test("SerialTerminalPanel writes bytes to terminal buffer", async () => {
  makeDom(FRAGMENT);
  const bus = new EventBus();
  new SerialTerminalPanel({ bus, serialManager: new FakeSerialManager() }).mount(document.getElementById("root"));
  bus.emit(Topics.SERIAL_DATA, { bytes: new TextEncoder().encode("Hello\n") });
  await flushPaint();
  const log = document.querySelector("#serial-term-log");
  assert.ok(log.textContent.includes("Hello"), "should render received bytes");
  assert.ok(log.querySelector(".term-line"), "should have term-line elements");
  teardownDom();
});

test("SerialTerminalPanel _onSend appends CRLF and clears input", async () => {
  makeDom(FRAGMENT);
  const sm = new FakeSerialManager();
  new SerialTerminalPanel({ bus: new EventBus(), serialManager: sm }).mount(document.getElementById("root"));
  document.querySelector("#serial-tx-input").value = "test";
  document.querySelector("#btn-serial-send").click();
  await new Promise(r => setTimeout(r, 10));
  assert.ok(sm._sent.length > 0, "should have sent data");
  const sent = new TextDecoder().decode(sm._sent[0]);
  assert.ok(sent.endsWith("\r\n"), "should append CRLF");
  assert.equal(document.querySelector("#serial-tx-input").value, "");
  teardownDom();
});

test("SerialTerminalPanel _onClear resets buffer", async () => {
  makeDom(FRAGMENT);
  new SerialTerminalPanel({ bus: new EventBus(), serialManager: new FakeSerialManager() }).mount(document.getElementById("root"));
  document.querySelector("#btn-serial-clear").click();
  await flushPaint();
  assert.equal(document.querySelector("#serial-term-log").textContent, "");
  assert.equal(document.querySelector("#serial-term-log").children.length, 0);
  teardownDom();
});

test("SerialTerminalPanel crAsNewline true by default", async () => {
  makeDom(FRAGMENT);
  const panel = new SerialTerminalPanel({ bus: new EventBus(), serialManager: new FakeSerialManager() });
  panel.mount(document.getElementById("root"));
  panel._buffer.appendString("a\rb\n");
  await flushPaint();
  const log = document.querySelector("#serial-term-log");
  assert.equal(log.querySelectorAll(".term-line").length, 2, "two lines when CR is newline");
  teardownDom();
});

test("SerialTerminalPanel restores CR checkbox from localStorage", () => {
  makeDom(FRAGMENT);
  localStorage.setItem("terminal:cr-as-newline:serial", "false");
  new SerialTerminalPanel({ bus: new EventBus(), serialManager: new FakeSerialManager() }).mount(document.getElementById("root"));
  const chk = document.querySelector("#chk-serial-cr-newline");
  assert.equal(chk.checked, false);
  teardownDom();
});
