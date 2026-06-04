import test from "node:test";
import assert from "node:assert/strict";
import { Topics } from "../../src/core/event-bus-topics.js";

test("Topics object is frozen", () => {
  assert.ok(Object.isFrozen(Topics));
});

test("Topics has all expected keys", () => {
  const expected = [
    "BACKEND_CONNECTED",
    "BACKEND_DISCONNECTED",
    "BACKEND_PROGRESS",
    "FLASH_PROGRESS",
    "IMAGE_CHANGED",
    "READ_REGIONS_CHANGED",
    "LOG_LINE",
    "SERIAL_DATA",
    "SERIAL_CONNECTED",
    "SERIAL_DISCONNECTED",
  ];
  for (const key of expected) {
    assert.ok(Topics[key], `Topic ${key} should exist`);
    assert.ok(typeof Topics[key] === "string");
  }
});

test("Topics values are prefixed with domain", () => {
  assert.ok(Topics.BACKEND_CONNECTED.startsWith("backend:"));
  assert.ok(Topics.SERIAL_CONNECTED.startsWith("serial:"));
  assert.ok(Topics.IMAGE_CHANGED.startsWith("image:"));
  assert.ok(Topics.LOG_LINE.startsWith("log:"));
  assert.ok(Topics.READ_REGIONS_CHANGED.startsWith("read-regions:"));
});
