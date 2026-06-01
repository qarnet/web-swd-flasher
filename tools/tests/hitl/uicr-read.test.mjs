import test from "node:test";
import assert from "node:assert/strict";
import { openProbe, teardown, getAdi } from "./probe.mjs";

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

const UICR_REGS = [
  { name: "CLENR0",      addr: 0x10001000 },
  { name: "RBPCONF",     addr: 0x10001004 },
  { name: "XTALFREQ",    addr: 0x10001008 },
  { name: "FWID",        addr: 0x10001010 },
  { name: "PSELRESET[0]", addr: 0x10001200 },
  { name: "PSELRESET[1]", addr: 0x10001204 },
  { name: "APPROTECT",   addr: 0x10001208 },
  { name: "NFCPINS",     addr: 0x1000120c },
];

test("uicr: all UICR registers are readable", skipIfNoProbe(), async () => {
  const adi = getAdi();
  for (const { name, addr } of UICR_REGS) {
    const val = await adi.readMem32(addr);
    // 0xFFFFFFFF means unprogrammed/erased — still valid
    assert.ok(typeof val === "number", `${name} read failed`);
    console.log(`  ${name.padEnd(14)}: 0x${val.toString(16).padStart(8, "0")}`);
  }
});

test("uicr: APPROTECT register is readable", skipIfNoProbe(), async () => {
  const val = await getAdi().readMem32(0x10001208);
  // 0xFFFFFFFF = no protection, 0x00000000 = protected (on nRF52)
  console.log(`  APPROTECT: 0x${val.toString(16)}`);
  assert.ok(typeof val === "number" && val <= 0xFFFFFFFF);
});

test.after(async () => {
  await teardown();
});