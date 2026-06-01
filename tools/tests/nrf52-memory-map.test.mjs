import test from "node:test";
import assert from "node:assert/strict";
import { validateAppRange } from "../../src/nrf/nrf52-memory-map.js";

const nrf52840 = {
  flash: { start: 0x00000000, size: 1024 * 1024 },
  uicr: { start: 0x10001000, size: 4096 },
  defaultAppStart: 0x00026000
};

function makeMap(segments) {
  return { segments };
}

test("validateAppRange allows app-only image in app-only mode", () => {
  const map = makeMap([{ start: 0x00026000, end: 0x00027000, length: 4097 }]);
  const result = validateAppRange(map, "app-only", nrf52840);
  assert.equal(result.ok, true);
  assert.equal(result.violations.length, 0);
});

test("validateAppRange rejects image starting below appStart in app-only mode", () => {
  const map = makeMap([{ start: 0x00020000, end: 0x00027000, length: 28673 }]);
  const result = validateAppRange(map, "app-only", nrf52840);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => v.includes("below")));
});

test("validateAppRange rejects image overlapping UICR in app-only mode", () => {
  const map = makeMap([{ start: 0x10001000, end: 0x10001FFF, length: 4096 }]);
  const result = validateAppRange(map, "app-only", nrf52840);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => v.includes("UICR")));
});

test("validateAppRange allows UICR segment in full-flash mode", () => {
  const map = makeMap([{ start: 0x10001000, end: 0x10001FFF, length: 4096 }]);
  const result = validateAppRange(map, "full-flash", nrf52840);
  assert.equal(result.ok, true);
});

test("validateAppRange allows bootloader segment in full-flash mode", () => {
  const map = makeMap([{ start: 0x00000000, end: 0x00001000, length: 4097 }]);
  const result = validateAppRange(map, "full-flash", nrf52840);
  assert.equal(result.ok, true);
});

test("validateAppRange rejects bootloader segment in app-only mode", () => {
  const map = makeMap([{ start: 0x00000000, end: 0x00001000, length: 4097 }]);
  const result = validateAppRange(map, "app-only", nrf52840);
  assert.equal(result.ok, false);
});

test("validateAppRange rejects segment beyond flash end", () => {
  const map = makeMap([{ start: 0x10002000, end: 0x10002FFF, length: 4096 }]);
  const result = validateAppRange(map, "full-flash", nrf52840);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => v.includes("beyond")));
});

test("validateAppRange uses default bounds when no target descriptor", () => {
  const map = makeMap([{ start: 0x00026000, end: 0x00027000, length: 4097 }]);
  const result = validateAppRange(map, "app-only");
  assert.equal(result.ok, true);
});

test("validateAppRange with nrf52833 target", () => {
  const nrf52833 = {
    flash: { start: 0x00000000, size: 512 * 1024 },
    uicr: { start: 0x10001000, size: 4096 },
    defaultAppStart: 0x00001000
  };
  const map = makeMap([{ start: 0x00001000, end: 0x00002000, length: 4097 }]);
  const result = validateAppRange(map, "app-only", nrf52833);
  assert.equal(result.ok, true);
});

test("validateAppRange empty image passes in app-only mode", () => {
  const map = makeMap([]);
  const result = validateAppRange(map, "app-only", nrf52840);
  assert.equal(result.ok, true);
});