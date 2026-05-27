import test from "node:test";
import assert from "node:assert/strict";
import { BackendManager } from "../../src/core/backend-manager.js";
import { ProgressBus } from "../../src/core/progress.js";

test("backend manager returns mock backend by default", async () => {
  const bus = new ProgressBus();
  const manager = new BackendManager(bus);
  const backend = manager.getBackend();
  await backend.requestDevice();
  await backend.connect();
  const probe = await backend.getProbeInfo();
  assert.equal(probe.backend, "mock");
});

test("progress bus receives backend events", async () => {
  const bus = new ProgressBus();
  const manager = new BackendManager(bus);
  const backend = manager.getBackend();
  const events = [];
  bus.subscribe((evt) => events.push(evt.type));
  await backend.connect();
  await backend.disconnect();
  assert.deepEqual(events, ["connect", "disconnect"]);
});

test("backend manager can switch backend implementations", () => {
  const bus = new ProgressBus();
  const manager = new BackendManager(bus);
  const jlink = manager.setBackend("jlink-webusb");
  const cmsis = manager.setBackend("cmsis-dap");
  assert.equal(jlink.capabilities().supportsFlash, true);
  assert.equal(cmsis.capabilities().supportsVerify, true);
});
