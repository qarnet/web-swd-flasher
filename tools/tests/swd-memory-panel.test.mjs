import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { makeFakeBackend } from "./helpers/fake-backend.mjs";
import { EventBus } from "../../src/core/event-bus.js";
import { ReadRegionsStore } from "../../src/core/read-regions-store.js";
import { SwdMemoryPanel } from "../../src/ui/panels/swd-memory-panel.js";

test("SwdMemoryPanel parseHexInput hex and decimal", () => {
  makeDom(`<div id="root"><input id="mem-addr-input"><input id="mem-len-input"><button id="btn-mem-read"></button><button id="btn-mem-read-flash"></button><button id="btn-mem-export"></button><button id="btn-mem-export-hex"></button><span id="mem-status"></span><pre id="mem-dump"></pre></div>`);
  const panel = new SwdMemoryPanel({ bus: new EventBus(), readRegions: new ReadRegionsStore(new EventBus()), backendProvider: () => makeFakeBackend(), logger: { log: () => {} } });
  panel.mount(document.getElementById("root"));
  assert.equal(panel._parseHexInput("0x1000"), 0x1000);
  assert.equal(panel._parseHexInput("4096"), 4096);
  assert.ok(isNaN(panel._parseHexInput("")));
  teardownDom();
});

test("SwdMemoryPanel formatHexDump produces expected output", () => {
  const buf = new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF]);
  const panel = new SwdMemoryPanel({ bus: new EventBus(), readRegions: new ReadRegionsStore(new EventBus()), backendProvider: () => makeFakeBackend(), logger: { log: () => {} } });
  const dump = panel._formatHexDump(0x1000, buf);
  assert.ok(dump.startsWith("00001000:"));
  assert.ok(dump.includes("00 11 22 33 44 55 66 77"));
});

test("SwdMemoryPanel read calls readRegions.set on success", async () => {
  makeDom(`<div id="root"><input id="mem-addr-input" value="0x1000"><input id="mem-len-input" value="16"><button id="btn-mem-read"></button><button id="btn-mem-read-flash"></button><button id="btn-mem-export"></button><button id="btn-mem-export-hex"></button><span id="mem-status"></span><pre id="mem-dump"></pre></div>`);
  const bus = new EventBus();
  const store = new ReadRegionsStore(bus);
  const memAccess = { readBlockFast: async () => new Uint32Array(4), maxReadBlockWordCount: 256 };
  new SwdMemoryPanel({ bus, readRegions: store, backendProvider: () => makeFakeBackend({ memoryAccess: memAccess }), logger: { log: () => {} } }).mount(document.getElementById("root"));
  document.querySelector("#btn-mem-read").click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(store.regions.length, 1);
  assert.equal(store.regions[0].start, 0x1000);
  assert.equal(store.regions[0].ok, true);
  teardownDom();
});

test("SwdMemoryPanel uses withQuietLog when backend supports it", async () => {
  makeDom(`<div id="root"><input id="mem-addr-input" value="0x0"><input id="mem-len-input" value="12"><button id="btn-mem-read"></button><button id="btn-mem-read-flash"></button><button id="btn-mem-export"></button><button id="btn-mem-export-hex"></button><span id="mem-status"></span><pre id="mem-dump"></pre></div>`);
  let quietCalled = false;
  const memAccess = { readBlockFast: async () => new Uint32Array(16), maxReadBlockWordCount: 16 };
  const backend = { ...makeFakeBackend({ memoryAccess: memAccess }), withQuietLog: async (fn) => { quietCalled = true; return fn(); }, activeTarget: { flash: { start: 0, size: 64 } } };
  new SwdMemoryPanel({ bus: new EventBus(), readRegions: new ReadRegionsStore(new EventBus()), backendProvider: () => backend, logger: { log: () => {} } }).mount(document.getElementById("root"));
  document.querySelector("#btn-mem-read-flash").click();
  await new Promise(r => setTimeout(r, 50));
  assert.equal(quietCalled, true);
  teardownDom();
});
