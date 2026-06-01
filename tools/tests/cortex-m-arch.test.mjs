import test from "node:test";
import assert from "node:assert/strict";
import {
  AIRCR,
  AIRCR_VECTKEY_SYSRESETREQ,
  DHCSR,
  DCRSR,
  DCRDR,
  FP_CTRL,
  FP_COMP0,
} from "../../src/arch/cortex-m.js";

test("AIRCR constant matches Cortex-M4 spec", () => {
  assert.equal(AIRCR, 0xE000ED0C);
});

test("AIRCR_VECTKEY_SYSRESETREQ has correct value", () => {
  assert.equal(AIRCR_VECTKEY_SYSRESETREQ, 0x05FA0004);
});

test("DHCSR matches debug halt control register", () => {
  assert.equal(DHCSR, 0xE000EDF0);
});

test("DCRSR matches debug core register selector", () => {
  assert.equal(DCRSR, 0xE000EDF4);
});

test("DCRDR matches debug core register data", () => {
  assert.equal(DCRDR, 0xE000EDF8);
});

test("FP_CTRL matches FPU control register", () => {
  assert.equal(FP_CTRL, 0xE0002000);
});

test("FP_COMP0 matches FPU comparator 0", () => {
  assert.equal(FP_COMP0, 0xE0002008);
});

test("All constants are exported and non-zero", () => {
  const constants = [AIRCR, AIRCR_VECTKEY_SYSRESETREQ, DHCSR, DCRSR, DCRDR, FP_CTRL, FP_COMP0];
  for (const c of constants) {
    assert.ok(c > 0, `constant ${c} should be > 0`);
  }
});
