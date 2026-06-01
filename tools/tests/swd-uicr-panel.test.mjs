import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { makeFakeBackend } from "./helpers/fake-backend.mjs";
import { EventBus } from "../../src/core/event-bus.js";
import { Topics } from "../../src/core/event-bus-topics.js";
import { SwdUicrPanel } from "../../src/ui/panels/swd-uicr-panel.js";

test("SwdUicrPanel buttons start disabled", () => {
  makeDom(`<div id="root"><button id="btn-uicr-read"></button><span id="uicr-status"></span><pre id="uicr-dump"></pre></div>`);
  const panel = new SwdUicrPanel({ bus: new EventBus(), backendProvider: () => makeFakeBackend(), logger: { log: () => {} } });
  panel.mount(document.getElementById("root"));
  assert.equal(document.querySelector("#btn-uicr-read").disabled, true);
  teardownDom();
});

test("SwdUicrPanel enables on BACKEND_CONNECTED", () => {
  makeDom(`<div id="root"><button id="btn-uicr-read"></button><span id="uicr-status"></span><pre id="uicr-dump"></pre></div>`);
  const bus = new EventBus();
  new SwdUicrPanel({ bus, backendProvider: () => makeFakeBackend(), logger: { log: () => {} } }).mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  assert.equal(document.querySelector("#btn-uicr-read").disabled, false);
  teardownDom();
});

test("SwdUicrPanel clears on BACKEND_DISCONNECTED", () => {
  makeDom(`<div id="root"><button id="btn-uicr-read"></button><span id="uicr-status">old</span><pre id="uicr-dump">old</pre></div>`);
  const bus = new EventBus();
  new SwdUicrPanel({ bus, backendProvider: () => makeFakeBackend(), logger: { log: () => {} } }).mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  bus.emit(Topics.BACKEND_DISCONNECTED);
  assert.equal(document.querySelector("#btn-uicr-read").disabled, true);
  assert.equal(document.querySelector("#uicr-status").textContent, "");
  assert.equal(document.querySelector("#uicr-dump").textContent, "");
  teardownDom();
});

test("SwdUicrPanel read happy path", async () => {
  makeDom(`<div id="root"><button id="btn-uicr-read"></button><span id="uicr-status"></span><pre id="uicr-dump"></pre></div>`);
  const memAccess = {
    readMem32: async () => 0xDEADBEEF,
  };
  const panel = new SwdUicrPanel({
    bus: new EventBus(),
    backendProvider: () => makeFakeBackend({ memoryAccess: memAccess }),
    logger: { log: () => {} },
  });
  panel.mount(document.getElementById("root"));
  document.querySelector("#btn-uicr-read").click();
  await new Promise(r => setTimeout(r, 10));
  const dump = document.querySelector("#uicr-dump").textContent;
  assert.ok(dump.includes("CLENR0"), "dump should include register name");
  assert.ok(dump.includes("deadbeef"), "dump should include value");
  assert.ok(document.querySelector("#uicr-status").textContent.includes("complete"));
  teardownDom();
});
