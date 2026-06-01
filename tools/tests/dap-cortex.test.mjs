import test from "node:test";
import assert from "node:assert/strict";
import { DapCortex } from "../../src/backends/cmsis-dap/dap-cortex.js";
import { FakeAdi } from "./helpers/fake-adi.mjs";

const DHCSR    = 0xe000edf0;
const DCRSR    = 0xe000edf4;
const DCRDR    = 0xe000edf8;
const S_REGRDY = 1 << 16;
const S_HALT   = 1 << 17;
const DBGKEY    = 0xa05f << 16;
const C_DEBUGEN = 0x0001;
const C_HALT   = 0x0002;
const C_STEP   = 0x0004;
const C_MASKINTS = 0x0008;

// FakeAdi that simulates Cortex-M DHCSR register behavior.
// DHCSR reads return only status bits (NO DBGKEY in the read value).
// Write DHCSR to change halt/resume/step state.
// Write DCRSR to make a register value appear in DCRDR with S_REGRDY set.
class CortexFakeAdi extends FakeAdi {
  constructor() {
    super();
    this._halted = false;
    this._regReady = true;
    this._regValues = new Map();
  }

  async readMem32(addr) {
    addr = addr >>> 0;
    if (addr === DHCSR) {
      let val = C_DEBUGEN;
      if (this._halted) val |= S_HALT;
      if (this._regReady) val |= S_REGRDY;
      return val;
    }
    if (addr === DCRDR) {
      return this._regValues.get(DCRDR) ?? 0;
    }
    return super.readMem32(addr);
  }

  async writeMem32(addr, value) {
    addr = addr >>> 0;
    value = value >>> 0;
    if (addr === DHCSR) {
      // DBGKEY | C_DEBUGEN | C_HALT → halt
      // DBGKEY | C_DEBUGEN → resume (clears halt)
      // DBGKEY | C_DEBUGEN | C_STEP | C_MASKINTS → step (halts)
      if (value & C_STEP) {
        this._halted = true;
      } else if (value & C_HALT) {
        this._halted = true;
      } else if ((value & C_DEBUGEN) && !(value & C_HALT)) {
        this._halted = false;
      }
    }
    if (addr === DCRSR) {
      const regNum = value & 0x1f;
      this._regReady = true;
      this._regValues.set(DCRDR, (0xDEAD0000 | regNum) >>> 0);
    }
    return super.writeMem32(addr, value);
  }
}

test("cortex readRegister writes DCRSR then reads DCRDR", async () => {
  const adi = new CortexFakeAdi();
  const cortex = new DapCortex(adi);
  const result = await cortex.readRegister(15);
  assert.equal(result, 0xDEAD000F);

  const dcrsrWrites = adi.writes.filter(w => w.addr === DCRSR);
  assert.ok(dcrsrWrites.length >= 1, "expected at least one DCRSR write");
  assert.equal(dcrsrWrites[0].value, 15);
});

test("cortex halt then isHalted returns true", async () => {
  const adi = new CortexFakeAdi();
  const cortex = new DapCortex(adi);
  assert.equal(await cortex.isHalted(), false, "should not be halted initially");
  await cortex.halt();
  assert.equal(await cortex.isHalted(), true, "should be halted after halt()");
});

test("cortex resume clears halt state", async () => {
  const adi = new CortexFakeAdi();
  const cortex = new DapCortex(adi);
  await cortex.halt();
  assert.equal(await cortex.isHalted(), true);
  await cortex.resume();
  assert.equal(await cortex.isHalted(), false, "should be running after resume");
});

test("cortex step halts the core", async () => {
  const adi = new CortexFakeAdi();
  const cortex = new DapCortex(adi);
  await cortex.step();
  assert.equal(await cortex.isHalted(), true);
  await cortex.resume();
});

test("cortex readCoreRegs reads 17 registers", async () => {
  const adi = new CortexFakeAdi();
  const cortex = new DapCortex(adi);
  const regs = await cortex.readCoreRegs();
  assert.equal(Object.keys(regs).length, 17, `expected 17 regs, got ${Object.keys(regs).length}`);
  assert.equal(regs.pc, 0xDEAD000F);
  assert.equal(regs.sp, 0xDEAD000D);
  assert.equal(regs.lr, 0xDEAD000E);
  assert.equal(regs.r0, 0xDEAD0000);
});

test("cortex halt writes DHCSR with DBGKEY | C_DEBUGEN | C_HALT", async () => {
  const adi = new CortexFakeAdi();
  const cortex = new DapCortex(adi);
  await cortex.halt();

  const dhcsrWrites = adi.writes.filter(w => w.addr === DHCSR);
  assert.ok(dhcsrWrites.length >= 1, "expected at least one DHCSR write");
  const val = dhcsrWrites[0].value;
  assert.ok(val & DBGKEY, "DBGKEY not set");
  assert.ok(val & C_HALT, "C_HALT not set");
  assert.ok(val & C_DEBUGEN, "C_DEBUGEN not set");
});

test("cortex resume writes DHCSR with DBGKEY | C_DEBUGEN (no C_HALT)", async () => {
  const adi = new CortexFakeAdi();
  const cortex = new DapCortex(adi);
  await cortex.halt();
  adi.writes.length = 0;
  await cortex.resume();

  const dhcsrWrites = adi.writes.filter(w => w.addr === DHCSR);
  assert.ok(dhcsrWrites.length >= 1, "expected DHCSR write");
  const val = dhcsrWrites[0].value;
  assert.ok(val & DBGKEY, "DBGKEY not set");
  assert.ok(!(val & C_HALT), "C_HALT should be cleared");
  assert.ok(val & C_DEBUGEN, "C_DEBUGEN should remain set");
});