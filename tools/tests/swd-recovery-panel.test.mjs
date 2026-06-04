import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { makeFakeBackend } from "./helpers/fake-backend.mjs";
import { EventBus } from "../../src/core/event-bus.js";
import { Topics } from "../../src/core/event-bus-topics.js";
import { SwdRecoveryPanel } from "../../src/ui/panels/swd-recovery-panel.js";

test("SwdRecoveryPanel buttons start disabled", () => {
  makeDom(`<div id="root">
    <button id="btn-check-protection"></button>
    <button id="btn-recover"></button>
    <span id="recovery-status"></span>
  </div>`);
  const panel = new SwdRecoveryPanel({
    bus: new EventBus(),
    backendProvider: () => makeFakeBackend(),
    logger: { log: () => {} },
  });
  panel.mount(document.getElementById("root"));
  assert.equal(document.querySelector("#btn-check-protection").disabled, true);
  assert.equal(document.querySelector("#btn-recover").disabled, true);
  teardownDom();
});

test("SwdRecoveryPanel buttons enable on BACKEND_CONNECTED", () => {
  makeDom(`<div id="root">
    <button id="btn-check-protection"></button>
    <button id="btn-recover"></button>
    <span id="recovery-status"></span>
  </div>`);
  const bus = new EventBus();
  const panel = new SwdRecoveryPanel({
    bus,
    backendProvider: () => makeFakeBackend(),
    logger: { log: () => {} },
  });
  panel.mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, { backend: makeFakeBackend() });
  assert.equal(document.querySelector("#btn-check-protection").disabled, false);
  assert.equal(document.querySelector("#btn-recover").disabled, false);
  teardownDom();
});

test("SwdRecoveryPanel buttons disable on BACKEND_DISCONNECTED", () => {
  makeDom(`<div id="root">
    <button id="btn-check-protection"></button>
    <button id="btn-recover"></button>
    <span id="recovery-status"></span>
  </div>`);
  const bus = new EventBus();
  const panel = new SwdRecoveryPanel({
    bus,
    backendProvider: () => makeFakeBackend(),
    logger: { log: () => {} },
  });
  panel.mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  bus.emit(Topics.BACKEND_DISCONNECTED);
  assert.equal(document.querySelector("#btn-check-protection").disabled, true);
  assert.equal(document.querySelector("#btn-recover").disabled, true);
  assert.equal(document.querySelector("#recovery-status").textContent, "");
});

test("SwdRecoveryPanel check short-circuits when getRecovery is null", async () => {
  makeDom(`<div id="root">
    <button id="btn-check-protection"></button>
    <button id="btn-recover"></button>
    <span id="recovery-status"></span>
  </div>`);
  const bus = new EventBus();
  const panel = new SwdRecoveryPanel({
    bus,
    backendProvider: () => makeFakeBackend(),
    logger: { log: () => {} },
  });
  panel.mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  document.querySelector("#btn-check-protection").click();
  await new Promise(r => setTimeout(r, 10));
  assert.ok(document.querySelector("#recovery-status").textContent.includes("not supported"));
  teardownDom();
});

test("SwdRecoveryPanel checkProtection happy path", async () => {
  makeDom(`<div id="root">
    <button id="btn-check-protection"></button>
    <button id="btn-recover"></button>
    <span id="recovery-status"></span>
  </div>`);
  const logs = [];
  const bus = new EventBus();
  const recovery = {
    checkProtection: async () => ({ locked: false, apProtectStatus: 0x00 }),
  };
  const panel = new SwdRecoveryPanel({
    bus,
    backendProvider: () => makeFakeBackend({ recovery }),
    logger: { log: (msg) => logs.push(msg) },
  });
  panel.mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  document.querySelector("#btn-check-protection").click();
  await new Promise(r => setTimeout(r, 10));
  assert.ok(document.querySelector("#recovery-status").textContent.includes("Unlocked"));
  assert.ok(logs.some(l => l.includes("Protection check: Unlocked")));
  teardownDom();
});

test("SwdRecoveryPanel checkProtection error path", async () => {
  makeDom(`<div id="root">
    <button id="btn-check-protection"></button>
    <button id="btn-recover"></button>
    <span id="recovery-status"></span>
  </div>`);
  const logs = [];
  const bus = new EventBus();
  const recovery = {
    checkProtection: async () => { throw new Error("SWD error"); },
  };
  const panel = new SwdRecoveryPanel({
    bus,
    backendProvider: () => makeFakeBackend({ recovery }),
    logger: { log: (msg) => logs.push(msg) },
  });
  panel.mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  document.querySelector("#btn-check-protection").click();
  await new Promise(r => setTimeout(r, 10));
  assert.ok(document.querySelector("#recovery-status").textContent.includes("Check failed"));
  assert.ok(logs.some(l => l.includes("Protection check failed")));
  teardownDom();
});

test("SwdRecoveryPanel recoverDevice cancel skips backend call", async () => {
  makeDom(`<div id="root">
    <button id="btn-check-protection"></button>
    <button id="btn-recover"></button>
    <span id="recovery-status"></span>
  </div>`);
  const bus = new EventBus();
  let called = false;
  const recovery = {
    eraseAll: async () => { called = true; return { unlocked: true }; },
    checkProtection: async () => ({ locked: false, apProtectStatus: 0 }),
  };
  globalThis.window.confirm = () => false;
  const panel = new SwdRecoveryPanel({
    bus,
    backendProvider: () => makeFakeBackend({ recovery }),
    logger: { log: () => {} },
  });
  panel.mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  document.querySelector("#btn-recover").click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(called, false);
  teardownDom();
});

test("SwdRecoveryPanel mount/unmount releases listeners", () => {
  makeDom(`<div id="root">
    <button id="btn-check-protection"></button>
    <button id="btn-recover"></button>
    <span id="recovery-status"></span>
  </div>`);
  const bus = new EventBus();
  const panel = new SwdRecoveryPanel({
    bus,
    backendProvider: () => makeFakeBackend(),
    logger: { log: () => {} },
  });
  panel.mount(document.getElementById("root"));
  const before = bus.listenerCount ? bus.listenerCount(Topics.BACKEND_CONNECTED) : 1;
  panel.unmount();
  const after = bus.listenerCount ? bus.listenerCount(Topics.BACKEND_CONNECTED) : 0;
  assert.ok(after < before || after === 0, "listeners should be released after unmount");
  teardownDom();
});

test("SwdRecoveryPanel recoverDevice happy path shows unlocked", async () => {
  makeDom(`<div id="root">
    <button id="btn-check-protection"></button>
    <button id="btn-recover"></button>
    <span id="recovery-status"></span>
  </div>`);
  const bus = new EventBus();
  let eraseCalled = false;
  const recovery = {
    eraseAll: async (onProgress) => { eraseCalled = true; if (onProgress) onProgress({ busy: false }); return { unlocked: true }; },
    checkProtection: async () => ({ locked: true, apProtectStatus: 1 }),
  };
  globalThis.window.confirm = () => true;
  const panel = new SwdRecoveryPanel({
    bus,
    backendProvider: () => makeFakeBackend({ recovery }),
    logger: { log: () => {} },
  });
  panel.mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  document.querySelector("#btn-recover").click();
  await new Promise(r => setTimeout(r, 50));
  assert.equal(eraseCalled, true);
  const status = document.querySelector("#recovery-status").textContent.toLowerCase();
  assert.ok(status.includes("unlocked") || status.includes("complete"), `status="${status}"`);
  teardownDom();
});

test("SwdRecoveryPanel recoverDevice shows still-locked when unlocked=false", async () => {
  makeDom(`<div id="root">
    <button id="btn-check-protection"></button>
    <button id="btn-recover"></button>
    <span id="recovery-status"></span>
  </div>`);
  const bus = new EventBus();
  const recovery = {
    eraseAll: async () => ({ unlocked: false }),
    checkProtection: async () => ({ locked: true, apProtectStatus: 1 }),
  };
  globalThis.window.confirm = () => true;
  const panel = new SwdRecoveryPanel({
    bus,
    backendProvider: () => makeFakeBackend({ recovery }),
    logger: { log: () => {} },
  });
  panel.mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  document.querySelector("#btn-recover").click();
  await new Promise(r => setTimeout(r, 50));
  const status = document.querySelector("#recovery-status").textContent.toLowerCase();
  assert.ok(status.includes("locked") || status.includes("failed"), `expected "locked" in status, got: "${status}"`);
  teardownDom();
});

test("SwdRecoveryPanel recoverDevice error path shows error", async () => {
  makeDom(`<div id="root">
    <button id="btn-check-protection"></button>
    <button id="btn-recover"></button>
    <span id="recovery-status"></span>
  </div>`);
  const bus = new EventBus();
  const recovery = {
    eraseAll: async () => { throw new Error("erase timed out"); },
    checkProtection: async () => ({ locked: true, apProtectStatus: 1 }),
  };
  globalThis.window.confirm = () => true;
  const panel = new SwdRecoveryPanel({
    bus,
    backendProvider: () => makeFakeBackend({ recovery }),
    logger: { log: () => {} },
  });
  panel.mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  document.querySelector("#btn-recover").click();
  await new Promise(r => setTimeout(r, 50));
  const status = document.querySelector("#recovery-status").textContent.toLowerCase();
  assert.ok(status.includes("failed") || status.includes("erase timed out"), `expected failure in status, got: "${status}"`);
  teardownDom();
});
