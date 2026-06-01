import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { makeFakeBackend } from "./helpers/fake-backend.mjs";
import { EventBus } from "../../src/core/event-bus.js";
import { SwdConnectionPanel } from "../../src/ui/panels/swd-connection-panel.js";

class FakeBackendManager {
  constructor() { this.current = null; this.swdClockHz = 1000000; }
  setSwdClockHz(hz) { this.swdClockHz = hz; }
  setBackend() {
    this.current = {
      ...makeFakeBackend(),
      getAuthorizedDevices: async () => [],
      requestDevice: async () => {},
      connect: async () => {},
      getProbeInfo: async () => ({ backend: "test", name: "Test", transport: "fake", packetSize: 64, capabilities: 0x01, hasSWD: true }),
      getTargetInfo: async () => ({ family: "nRF52", part: "nRF52840", id: "nrf52840", flash: { start: 0, size: 1024*1024, pageSize: 4096 }, ram: { start: 0x20000000, size: 256*1024 }, programmer: "nvmc-nrf52", autoDetected: true, ficr: null }),
      disconnect: async () => {},
      activeTarget: { family: "nRF52", label: "nRF52840", id: "nrf52840", flash: { start: 0, size: 1048576 }, namedRegions: [] },
      availableTargets: [{ id: "nrf52840", label: "nRF52840" }],
      transport: { device: {} },
    };
    return this.current;
  }
  getBackend() { return this.current; }
}

const FRAGMENT = `<div id="compat-banner"><span id="compat-msg"></span></div>
  <div id="root"><select id="backend-select"><option value="test">test</option></select><select id="clock-select"><option value="1000000">1MHz</option></select><button id="btn-connect"></button><button id="btn-disconnect"></button>
  <select id="target-select"><option value="auto">auto</option></select><pre id="target-info"></pre><pre id="probe-caps"></pre>
  <div id="progress-bar"><div id="progress-fill"></div></div></div>`;

const fakeLogger = { log: () => {}, setStatus: () => {}, setLed: () => {}, setTopbarTarget: () => {} };

test("SwdConnectionPanel _populateTargetSelector skips generic", () => {
  makeDom(FRAGMENT);
  const mgr = new FakeBackendManager();
  const backend = mgr.setBackend("test");
  const panel = new SwdConnectionPanel({ bus: new EventBus(), backendProvider: () => backend, backendManager: mgr, logger: fakeLogger });
  panel.mount(document.getElementById("root"));
  panel._populateTargetSelector(backend);
  const opts = document.querySelectorAll("#target-select option");
  const ids = [...opts].map(o => o.value);
  assert.ok(ids.includes("nrf52840"));
  assert.ok(!ids.includes("generic"));
  teardownDom();
});

test("SwdConnectionPanel _onConnect sets connected flag", async () => {
  makeDom(FRAGMENT);
  const bus = new EventBus();
  const mgr = new FakeBackendManager();
  const panel = new SwdConnectionPanel({ bus, backendProvider: () => mgr.getBackend(), backendManager: mgr, logger: fakeLogger });
  panel.mount(document.getElementById("root"));
  document.querySelector("#btn-connect").click();
  await new Promise(r => setTimeout(r, 100));
  assert.equal(panel.connected, true);
  teardownDom();
});

test("SwdConnectionPanel mount does not crash", () => {
  makeDom(FRAGMENT);
  new SwdConnectionPanel({ bus: new EventBus(), backendProvider: () => makeFakeBackend(), backendManager: new FakeBackendManager(), logger: fakeLogger }).mount(document.getElementById("root"));
  assert.ok(true);
  teardownDom();
});
