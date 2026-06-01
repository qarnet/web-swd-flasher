/**
 * Hardware-in-the-loop tests for web-swd-flasher.
 *
 * Run with the probe (and a target nRF52) connected:
 *   node tools/hardware-test.mjs
 *
 * Or via npm:
 *   npm --prefix tools run hardware-test
 *
 * All tests skip automatically if no probe is found, so the script is safe to
 * run in CI without hardware (it will just report everything as skipped).
 *
 * Flags:
 *   --ram-test    Include a RAM write/read-back round-trip (non-destructive to flash)
 *   --verbose     Log every DAP command to stdout
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openProbeTransport } from "./node-probe-transport.mjs";
import { CmsisDapCore } from "../src/backends/cmsis-dap/dap-core.js";
import { AdiSession } from "../src/backends/cmsis-dap/adi.js";

const VERBOSE = process.argv.includes("--verbose");
const DO_RAM_TEST = process.argv.includes("--ram-test");

// nRF52 FICR base — chip identification registers
const FICR_BASE       = 0x10000000;
const FICR_CODEPAGESIZE = FICR_BASE + 0x010;  // should be 4096 on nRF52
const FICR_CODESIZE     = FICR_BASE + 0x014;  // number of flash pages
const FICR_PART         = FICR_BASE + 0x100;  // chip part number e.g. 0x52840
const FICR_VARIANT      = FICR_BASE + 0x104;  // variant e.g. 0x41414100 = "AAA0"

const NVMC_READY = 0x4001e400;
const RAM_BASE   = 0x20000000;

// ---------------------------------------------------------------------------
// Shared probe state — opened once, closed after all tests
// ---------------------------------------------------------------------------

let probeResult = null;
let core = null;
let adi = null;
let probeError = null;

try {
  const logger = VERBOSE ? (msg) => console.log(`  [dap] ${msg}`) : null;
  probeResult = await openProbeTransport(logger);
  core = new CmsisDapCore(probeResult.transport, 1_000_000);
  adi = new AdiSession(core);
  console.log(`\nProbe found: ${probeResult.name} (${probeResult.type})\n`);
} catch (err) {
  probeError = err.message;
  console.log(`\nNo probe: ${probeError}\nAll hardware tests will be skipped.\n`);
}

function skipIfNoProbe() {
  if (probeError) return { skip: probeError };
  return {};
}

// ---------------------------------------------------------------------------
// Tier 1: Probe-only — does not require a target attached
// ---------------------------------------------------------------------------

test("probe: DAP_Info returns a firmware version string", skipIfNoProbe(), async () => {
  const caps = await core.dapInfo();
  assert.ok(caps, "dapInfo returned null");
  // dapInfo returns an object with at least one truthy property
  const hasAny = Object.values(caps).some(Boolean);
  assert.ok(hasAny, `dapInfo returned empty caps: ${JSON.stringify(caps)}`);
});

test("probe: packet size is at least 64 bytes", skipIfNoProbe(), async () => {
  assert.ok(probeResult.transport.packetSize >= 64,
    `packetSize=${probeResult.transport.packetSize}`);
});

// ---------------------------------------------------------------------------
// Tier 2: SWD connection — requires a powered target
// ---------------------------------------------------------------------------

let connected = false;

test("swd: connect() returns a valid DPIDR", skipIfNoProbe(), async () => {
  const { dpidr } = await core.connect();
  // DPIDR[27:12] = designer (ARM = 0x477), bit 0 must be 1 (JEDEC continuation)
  assert.ok((dpidr & 1) === 1, `DPIDR bit 0 must be 1, got 0x${dpidr.toString(16)}`);
  // Arm CoreSight DPIDR values are 0x0bc10477, 0x0bd11477, etc.
  assert.ok(dpidr !== 0 && dpidr !== 0xffffffff,
    `DPIDR looks invalid: 0x${dpidr.toString(16)}`);
  connected = true;
  console.log(`  DPIDR: 0x${dpidr.toString(16)}`);
});

test("swd: CTRL-STAT power-up acks are set", { skip: !connected && "swd connect failed" }, async () => {
  const ctrlStat = await core.readDp(0x04);
  const acks = ctrlStat & 0xa0000000;
  assert.equal(acks, 0xa0000000,
    `Expected CSYSPWRUPACK+CDBGPWRUPACK, CTRL-STAT=0x${ctrlStat.toString(16)}`);
});

// ---------------------------------------------------------------------------
// Tier 3: nRF52 FICR identification
// ---------------------------------------------------------------------------

test("nrf52: FICR CODEPAGESIZE is 4096", { skip: !connected && "swd connect failed" }, async () => {
  const pageSize = await adi.readMem32(FICR_CODEPAGESIZE);
  assert.equal(pageSize, 4096,
    `Expected 4096, got ${pageSize} (0x${pageSize.toString(16)})`);
});

test("nrf52: FICR part number looks like an nRF52", { skip: !connected && "swd connect failed" }, async () => {
  const part = await adi.readMem32(FICR_PART);
  // nRF52 family: 0x00052xxx  (e.g. 0x52840, 0x52833, 0x52832)
  assert.ok(
    (part & 0xfff00000) === 0 && (part >>> 16) === 0x0052,
    `Expected nRF52xxx, FICR_PART=0x${part.toString(16)}`
  );
  const codeSize = await adi.readMem32(FICR_CODESIZE);
  const variant = await adi.readMem32(FICR_VARIANT);
  console.log(`  Part: nRF${part.toString(16).toUpperCase()}  pages: ${codeSize}  variant: 0x${variant.toString(16)}`);
});

test("nrf52: NVMC_READY is 1 at idle", { skip: !connected && "swd connect failed" }, async () => {
  const ready = await adi.readMem32(NVMC_READY);
  assert.equal(ready & 1, 1, `NVMC_READY=${ready}`);
});

// ---------------------------------------------------------------------------
// Tier 4: RAM round-trip  (needs --ram-test flag, still non-destructive to flash)
// ---------------------------------------------------------------------------

test("ram: single-word write/read-back", {
  skip: (!DO_RAM_TEST && "pass --ram-test to enable") || (!connected && "swd connect failed"),
}, async () => {
  const SENTINEL = 0xdeadbeef;
  await adi.writeMem32(RAM_BASE, SENTINEL);
  const readback = await adi.readMem32(RAM_BASE);
  assert.equal(readback, SENTINEL >>> 0, `Readback mismatch: 0x${readback.toString(16)}`);
});

test("ram: block write/read-back (14 words)", {
  skip: (!DO_RAM_TEST && "pass --ram-test to enable") || (!connected && "swd connect failed"),
}, async () => {
  const wordCount = 14;
  const words = new Uint32Array(wordCount);
  for (let i = 0; i < wordCount; i++) words[i] = (0xab000000 | i) >>> 0;

  await adi.writeMemBlockFast(RAM_BASE, words, 0, wordCount);
  const readback = await adi.readMemBlockFast(RAM_BASE, wordCount);

  for (let i = 0; i < wordCount; i++) {
    assert.equal(readback[i], words[i],
      `Word[${i}] mismatch: wrote 0x${words[i].toString(16)}, got 0x${readback[i].toString(16)}`);
  }
});

test("ram: block write spanning 1KB boundary", {
  skip: (!DO_RAM_TEST && "pass --ram-test to enable") || (!connected && "swd connect failed"),
}, async () => {
  // Write 30 words starting 4 words before a 1KB boundary so the write must
  // be split across two 1KB regions (TAR auto-increment wraps at bits[9:0]).
  const startAddr = (RAM_BASE + 0x400) - 4 * 4; // 4 words before first 1KB boundary
  const wordCount = 30;
  const words = new Uint32Array(wordCount);
  for (let i = 0; i < wordCount; i++) words[i] = (0xcc000000 | (i * 0x11)) >>> 0;

  await adi.writeMemBlockFast(startAddr, words, 0, wordCount);
  const readback = await adi.readMemBlockFast(startAddr, wordCount);

  for (let i = 0; i < wordCount; i++) {
    assert.equal(readback[i], words[i],
      `Word[${i}] @ 0x${(startAddr + i*4).toString(16)}: wrote 0x${words[i].toString(16)}, got 0x${readback[i].toString(16)}`);
  }
});

// ---------------------------------------------------------------------------
// Teardown — runs after all tests regardless of result
// ---------------------------------------------------------------------------

process.on("exit", () => {
  if (probeResult) {
    probeResult.transport.close().catch(() => {});
  }
});
