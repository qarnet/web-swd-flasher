import test from "node:test";
import assert from "node:assert/strict";
import { BackendManager } from "../../src/core/backend-manager.js";
import { EventBus } from "../../src/core/event-bus.js";

test("backend manager creates cmsis-dap backend", () => {
  const bus = new EventBus();
  const manager = new BackendManager(bus);
  const backend = manager.setBackend("cmsis-dap");
  assert.equal(backend.capabilities().supportsFlash, true);
  assert.equal(backend.capabilities().supportsVerify, true);
  assert.equal(backend.capabilities().supportsReset, true);
});

test("backend manager setSwdClockHz stores value", () => {
  const bus = new EventBus();
  const manager = new BackendManager(bus);
  manager.setSwdClockHz(2000000);
  assert.equal(manager.swdClockHz, 2000000);
});

test("backend manager getBackend creates default", () => {
  const bus = new EventBus();
  const manager = new BackendManager(bus);
  const backend = manager.getBackend();
  assert.equal(backend.capabilities().supportsFlash, true);
});
