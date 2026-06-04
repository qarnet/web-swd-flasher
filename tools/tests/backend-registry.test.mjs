import test from "node:test";
import assert from "node:assert/strict";
import { createBackend, BACKENDS } from "../../src/backends/backend-registry.js";

test("BACKENDS registry has cmsis-dap", () => {
  assert.ok(BACKENDS["cmsis-dap"]);
  assert.ok(BACKENDS["mock"]);
  assert.ok(BACKENDS["jlink-webusb"]);
});

test("createBackend returns cmsis-dap instance", () => {
  const b = createBackend("cmsis-dap", { bus: {}, logger: null, swdClockHz: 1000000 });
  assert.ok(b);
  assert.equal(typeof b.connect, "function");
  assert.equal(typeof b.capabilities, "function");
});

test("createBackend returns mock instance", () => {
  const b = createBackend("mock", { bus: {} });
  assert.ok(b);
  assert.equal(typeof b.connect, "function");
});

test("createBackend returns jlink-webusb instance", () => {
  const b = createBackend("jlink-webusb", { bus: {}, logger: null });
  assert.ok(b);
  assert.equal(typeof b.connect, "function");
});

test("createBackend throws on unknown name", () => {
  assert.throws(
    () => createBackend("nope", { bus: {} }),
    /Unknown backend/
  );
});
