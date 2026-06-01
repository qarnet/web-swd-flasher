import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { makeFakeBackend } from "./helpers/fake-backend.mjs";
import { EventBus } from "../../src/core/event-bus.js";
import { Topics } from "../../src/core/event-bus-topics.js";
import { SwdDebugPanel } from "../../src/ui/panels/swd-debug-panel.js";

test("SwdDebugPanel buttons start disabled", () => {
  makeDom(`<div id="root">
    <button id="btn-core-halt"></button><button id="btn-core-resume"></button><button id="btn-core-step"></button><button id="btn-core-regs"></button>
    <span id="debug-status"></span><pre id="debug-regs"></pre>
  </div>`);
  new SwdDebugPanel({ bus: new EventBus(), backendProvider: () => makeFakeBackend(), logger: { log: () => {} } }).mount(document.getElementById("root"));
  assert.equal(document.querySelector("#btn-core-halt").disabled, true);
  assert.equal(document.querySelector("#btn-core-resume").disabled, true);
  assert.equal(document.querySelector("#btn-core-step").disabled, true);
  assert.equal(document.querySelector("#btn-core-regs").disabled, true);
  teardownDom();
});

test("SwdDebugPanel enables on BACKEND_CONNECTED", () => {
  makeDom(`<div id="root">
    <button id="btn-core-halt"></button><button id="btn-core-resume"></button><button id="btn-core-step"></button><button id="btn-core-regs"></button>
    <span id="debug-status"></span><pre id="debug-regs"></pre>
  </div>`);
  const bus = new EventBus();
  new SwdDebugPanel({ bus, backendProvider: () => makeFakeBackend(), logger: { log: () => {} } }).mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  assert.equal(document.querySelector("#btn-core-halt").disabled, false);
  teardownDom();
});

test("SwdDebugPanel disables and clears on BACKEND_DISCONNECTED", () => {
  makeDom(`<div id="root">
    <button id="btn-core-halt"></button><button id="btn-core-resume"></button><button id="btn-core-step"></button><button id="btn-core-regs"></button>
    <span id="debug-status">old</span><pre id="debug-regs">old</pre>
  </div>`);
  const bus = new EventBus();
  new SwdDebugPanel({ bus, backendProvider: () => makeFakeBackend(), logger: { log: () => {} } }).mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  bus.emit(Topics.BACKEND_DISCONNECTED);
  assert.equal(document.querySelector("#btn-core-halt").disabled, true);
  assert.equal(document.querySelector("#debug-status").textContent, "");
  assert.equal(document.querySelector("#debug-regs").textContent, "");
  teardownDom();
});

test("SwdDebugPanel halt hits cortex", async () => {
  makeDom(`<div id="root"><button id="btn-core-halt"></button><button id="btn-core-resume"></button><button id="btn-core-step"></button><button id="btn-core-regs"></button><span id="debug-status"></span><pre id="debug-regs"></pre></div>`);
  let haltCalled = false, resumeCalled = false;
  const cortex = { halt: async () => { haltCalled = true; }, resume: async () => { resumeCalled = true; }, step: async () => {}, readCoreRegs: async () => ({}) };
  const bus = new EventBus();
  new SwdDebugPanel({ bus, backendProvider: () => makeFakeBackend({ cortex }), logger: { log: () => {} } }).mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  document.querySelector("#btn-core-halt").click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(haltCalled, true);
  document.querySelector("#btn-core-resume").click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(resumeCalled, true);
  teardownDom();
});

test("SwdDebugPanel regs renders output", async () => {
  makeDom(`<div id="root"><button id="btn-core-halt"></button><button id="btn-core-resume"></button><button id="btn-core-step"></button><button id="btn-core-regs"></button><span id="debug-status"></span><pre id="debug-regs"></pre></div>`);
  const cortex = { readCoreRegs: async () => ({ r0: 0, r1: 1, r2: 2, r3: 3, r4: 4, r5: 5, r6: 6, r7: 7, r8: 8, r9: 9, r10: 10, r11: 11, r12: 12, sp: 0x20001000, lr: 0x1000, pc: 0x2000, xpsr: 0 }) };
  const bus = new EventBus();
  new SwdDebugPanel({ bus, backendProvider: () => makeFakeBackend({ cortex }), logger: { log: () => {} } }).mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  document.querySelector("#btn-core-regs").click();
  await new Promise(r => setTimeout(r, 10));
  const regs = document.querySelector("#debug-regs").textContent;
  assert.ok(regs.includes("r0"), "should include register names");
  assert.ok(document.querySelector("#debug-regs").hidden === false, "regs element should be visible");
  teardownDom();
});
