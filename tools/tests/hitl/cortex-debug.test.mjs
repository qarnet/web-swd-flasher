import test from "node:test";
import assert from "node:assert/strict";
import { openProbe, teardown, makeCortex, getAdi } from "./probe.mjs";

let probeError = null;
let connected = false;

try {
  await openProbe();
  connected = true;
} catch (err) {
  probeError = err.message;
}

function skipIfNoProbe() {
  if (probeError) return { skip: probeError };
  if (!connected) return { skip: "SWD connect failed" };
  return {};
}

const RAM_BASE = 0x20000000;

test("cortex: halt and check halted state", skipIfNoProbe(), async () => {
  const cortex = makeCortex();
  await cortex.halt();
  const halted = await cortex.isHalted();
  assert.equal(halted, true, "Core should be halted after halt()");
  // Resume to un-halt
  await cortex.resume();
});

test("cortex: resume and check running state", skipIfNoProbe(), async () => {
  const cortex = makeCortex();
  await cortex.halt();
  await cortex.resume();
  const halted = await cortex.isHalted();
  assert.equal(halted, false, "Core should be running after resume()");
});

test("cortex: halt → step → still halted", skipIfNoProbe(), async () => {
  const cortex = makeCortex();
  await cortex.halt();
  await cortex.step();
  const halted = await cortex.isHalted();
  assert.equal(halted, true, "Core should still be halted after step()");
  await cortex.resume();
});

test("cortex: readCoreRegs reads all 17 registers", skipIfNoProbe(), async () => {
  const cortex = makeCortex();
  await cortex.halt();
  try {
    const regs = await cortex.readCoreRegs();
    assert.equal(Object.keys(regs).length, 17, "Expected 17 registers");
    // SP should be in RAM range for nRF52
    assert.ok(regs.sp >= 0x20000000 && regs.sp <= 0x20040000,
      `SP (0x${regs.sp.toString(16)}) not in RAM range`);
    console.log(`  PC=0x${regs.pc.toString(16)} SP=0x${regs.sp.toString(16)} LR=0x${regs.lr.toString(16)}`);
  } finally {
    await cortex.resume();
  }
});

test("cortex: halt/resume preserves RAM content", skipIfNoProbe(), async () => {
  const adi = getAdi();
  const SENTINEL = 0xCAFEFEED;
  await adi.writeMem32(RAM_BASE + 0x400, SENTINEL);
  const cortex = makeCortex();
  await cortex.halt();
  await cortex.resume();
  // RAM may be slightly delayed after resume, small wait
  await new Promise(r => setTimeout(r, 50));
  const val = await adi.readMem32(RAM_BASE + 0x400);
  assert.equal(val, SENTINEL >>> 0,
    `RAM corrupted after halt/resume: expected 0x${SENTINEL.toString(16)}, got 0x${val.toString(16)}`);
});

test.after(async () => {
  await teardown();
});