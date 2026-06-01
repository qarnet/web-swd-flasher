import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { makeFakeBackend } from "./helpers/fake-backend.mjs";
import { EventBus } from "../../src/core/event-bus.js";
import { Topics } from "../../src/core/event-bus-topics.js";
import { ReadRegionsStore } from "../../src/core/read-regions-store.js";
import { SwdFirmwarePanel } from "../../src/ui/panels/swd-firmware-panel.js";
import { parseIntelHexFileText } from "../../src/hex/intel-hex-parser.js";
import { buildIntelHex } from "../../src/hex/intel-hex-encoder.js";

const FRAGMENT = `<div id="root">
  <input id="file-input" type="file"><select id="flash-mode-select"><option value="app-only">App</option><option value="full-flash" selected>Full</option></select>
  <input id="url-input"><select id="builtin-select"></select>
  <button id="btn-fetch-hex">Fetch</button><button id="btn-load-builtin">Load</button><button id="btn-clear-hex">Clear</button>
  <div id="file-list"></div><span id="image-summary"></span><pre id="image-map"></pre>
  <button id="btn-program"></button><button id="btn-verify"></button><button id="btn-reset"></button><button id="btn-program-verify-reset"></button>
  <label><input id="chk-confirm-program" type="checkbox"></label>
</div>`;

function makeHexText(addrs) {
  const bytes = new Uint8Array(addrs.length);
  for (let i = 0; i < addrs.length; i++) bytes[i] = i + 1;
  return buildIntelHex(addrs[0], bytes);
}

function backendWithCaps(caps) {
  return makeFakeBackend({ capabilities: caps });
}

test("SwdFirmwarePanel merges single hex file and emits IMAGE_CHANGED", () => {
  makeDom(FRAGMENT);
  const bus = new EventBus();
  const events = [];
  bus.on(Topics.IMAGE_CHANGED, (e) => events.push(e));
  const panel = new SwdFirmwarePanel({ bus, readRegions: new ReadRegionsStore(bus), backendProvider: () => makeFakeBackend(), logger: { log: () => {} } });
  panel.mount(document.getElementById("root"));

  const hexText = makeHexText([0x00026000, 0x00026001, 0x00026002, 0x00026003]);
  panel._addHexFromText("test.hex", hexText);

  // mount fires an empty event, _addHexFromText fires the real one
  assert.ok(events.length >= 1);
  const last = events[events.length - 1];
  assert.ok(last.context, "should have context");
  assert.equal(last.hexFiles.length, 1);
  assert.equal(document.querySelector("#image-summary").textContent.includes("1 file"), true);
  teardownDom();
});

test("SwdFirmwarePanel merge rejects malformed hex", () => {
  makeDom(FRAGMENT);
  const bus = new EventBus();
  const logs = [];
  const panel = new SwdFirmwarePanel({ bus, readRegions: new ReadRegionsStore(bus), backendProvider: () => makeFakeBackend(), logger: { log: (msg) => logs.push(msg) } });
  panel.mount(document.getElementById("root"));

  panel._addHexFromText("bad.hex", ":not-valid-hex\n");
  assert.ok(logs.some(l => l.includes("Parse failed")));
  assert.equal(panel.imageContext, null);
  teardownDom();
});

test("SwdFirmwarePanel merge clears on BACKEND_DISCONNECTED", () => {
  makeDom(FRAGMENT);
  const bus = new EventBus();
  const backend = backendWithCaps({ supportsFlash: true, supportsVerify: true, supportsReset: true });
  const panel = new SwdFirmwarePanel({ bus, readRegions: new ReadRegionsStore(bus), backendProvider: () => backend, logger: { log: () => {} } });
  panel.mount(document.getElementById("root"));

  panel._addHexFromText("a.hex", makeHexText([0x00026000, 0x00026001]));
  document.querySelector("#chk-confirm-program").checked = true;
  bus.emit(Topics.BACKEND_CONNECTED, { backend });
  assert.equal(document.querySelector("#btn-program").disabled, false);

  bus.emit(Topics.BACKEND_DISCONNECTED);
  assert.equal(document.querySelector("#btn-program").disabled, true);
  teardownDom();
});

test("SwdFirmwarePanel clearHex removes all files", () => {
  makeDom(FRAGMENT);
  const bus = new EventBus();
  const events = [];
  bus.on(Topics.IMAGE_CHANGED, (e) => events.push(e));
  const panel = new SwdFirmwarePanel({ bus, readRegions: new ReadRegionsStore(bus), backendProvider: () => makeFakeBackend(), logger: { log: () => {} } });
  panel.mount(document.getElementById("root"));

  panel._addHexFromText("a.hex", makeHexText([0x00026000, 0x00026001]));
  const beforeClear = panel.imageContext;
  assert.ok(beforeClear, "should have context before clear");

  panel._onClearHex();
  // clear emits another event with null context
  const after = panel.imageContext;
  assert.equal(after, null, "imageContext should be null after clear");
  teardownDom();
});

test("SwdFirmwarePanel program blocked without confirm", async () => {
  makeDom(FRAGMENT);
  const bus = new EventBus();
  const backend = backendWithCaps({ supportsFlash: true, supportsVerify: true, supportsReset: true });
  const panel = new SwdFirmwarePanel({ bus, readRegions: new ReadRegionsStore(bus), backendProvider: () => backend, logger: { log: () => {}, setStatus: () => {} } });
  panel.mount(document.getElementById("root"));

  panel._addHexFromText("a.hex", makeHexText([0x00026000]));
  bus.emit(Topics.BACKEND_CONNECTED, { backend });

  // Confirm not checked -> buttons stay disabled
  assert.equal(document.querySelector("#btn-program").disabled, true);
  teardownDom();
});

test("SwdFirmwarePanel clearHex removes all files", () => {
  makeDom(FRAGMENT);
  const bus = new EventBus();
  const events = [];
  bus.on(Topics.IMAGE_CHANGED, (e) => events.push(e));
  const panel = new SwdFirmwarePanel({ bus, readRegions: new ReadRegionsStore(bus), backendProvider: () => makeFakeBackend(), logger: { log: () => {} } });
  panel.mount(document.getElementById("root"));

  panel._addHexFromText("a.hex", makeHexText([0x00026000, 0x00026001]));
  const beforeClear = panel.imageContext;
  assert.ok(beforeClear, "should have context before clear");
  panel._onClearHex();
  assert.equal(panel.imageContext, null);
  teardownDom();
});

test("SwdFirmwarePanel updateButtons reflects capabilities", () => {
  makeDom(FRAGMENT);
  const bus = new EventBus();
  const backend = backendWithCaps({ supportsFlash: true, supportsVerify: true, supportsReset: true });
  const panel = new SwdFirmwarePanel({ bus, readRegions: new ReadRegionsStore(bus), backendProvider: () => backend, logger: { log: () => {} } });
  panel.mount(document.getElementById("root"));

  // Load hex, check confirm, connect
  panel._addHexFromText("a.hex", makeHexText([0x00026000, 0x00026001]));
  document.querySelector("#chk-confirm-program").checked = true;
  bus.emit(Topics.BACKEND_CONNECTED, { backend });

  assert.equal(document.querySelector("#btn-program").disabled, false);
  assert.equal(document.querySelector("#btn-verify").disabled, false);
  assert.equal(document.querySelector("#btn-reset").disabled, false);
  assert.equal(document.querySelector("#btn-program-verify-reset").disabled, false);
  teardownDom();
});

test("SwdFirmwarePanel program emits FLASH_PROGRESS", async () => {
  makeDom(FRAGMENT);
  const bus = new EventBus();
  const progressEvents = [];
  bus.on(Topics.FLASH_PROGRESS, (e) => progressEvents.push(e));
  const backend = {
    ...makeFakeBackend(),
    capabilities: () => ({ supportsFlash: true, supportsVerify: true, supportsReset: true }),
    programImage: async (parsed) => { bus.emit(Topics.FLASH_PROGRESS, { kind: "program", percent: 100, message: "done" }); },
  };
  const panel = new SwdFirmwarePanel({ bus, readRegions: new ReadRegionsStore(bus), backendProvider: () => backend, logger: { log: () => {}, setStatus: () => {} } });
  panel.mount(document.getElementById("root"));

  panel._addHexFromText("a.hex", makeHexText([0x00026000, 0x00026001]));
  document.querySelector("#chk-confirm-program").checked = true;
  bus.emit(Topics.BACKEND_CONNECTED, { backend });

  document.querySelector("#btn-program").click();
  await new Promise(r => setTimeout(r, 50));
  assert.ok(progressEvents.some(e => e.kind === "program" && e.percent === 100));
  teardownDom();
});
