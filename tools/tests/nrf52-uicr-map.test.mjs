import test from "node:test";
import assert from "node:assert/strict";
import { UICR_REGS } from "../../src/nrf/nrf52-uicr-map.js";

test("UICR_REGS is array with entries", () => {
  assert.ok(Array.isArray(UICR_REGS));
  assert.ok(UICR_REGS.length > 0);
});

test("Each UICR register has name and addr", () => {
  for (const reg of UICR_REGS) {
    assert.equal(typeof reg.name, "string");
    assert.equal(typeof reg.addr, "number");
    assert.ok(reg.addr >= 0x10001000);
  }
});

test("UICR_REGS contains known registers", () => {
  const names = UICR_REGS.map((r) => r.name);
  assert.ok(names.includes("APPROTECT"));
  assert.ok(names.includes("DEBUGCTRL"));
  assert.ok(names.includes("XTALFREQ"));
  assert.ok(names.includes("PSELRESET[0]"));
  assert.ok(names.includes("PSELRESET[1]"));
});

test("UICR_REGS CLENR0 is at base address", () => {
  assert.equal(UICR_REGS[0].name, "CLENR0");
  assert.equal(UICR_REGS[0].addr, 0x10001000);
});
