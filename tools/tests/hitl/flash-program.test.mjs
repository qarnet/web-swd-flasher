import test from "node:test";
import assert from "node:assert/strict";
import { openProbe, teardown, makeFlasher, getAdi, loadFirmwareHex } from "./probe.mjs";
import { FLASH_TEST } from "./flags.mjs";
import { validateAppRange } from "../../../src/nrf/nrf52-memory-map.js";

let probeError = null;
let connected = false;

try {
  await openProbe();
  connected = true;
} catch (err) {
  probeError = err.message;
}

function skipUnlessFlash() {
  if (probeError) return { skip: probeError };
  if (!connected) return { skip: "SWD connect failed" };
  if (!FLASH_TEST) return { skip: "Pass --flash-test to enable (destructive)" };
  return {};
}

const FLASH_START = 0x00000000;
const NVMC_READY = 0x4001e400;

test("flash: NVMC_READY is 1 at idle", skipUnlessFlash(), async () => {
  const ready = await getAdi().readMem32(NVMC_READY);
  assert.equal(ready & 1, 1, `NVMC_READY=${ready}`);
});

test("flash: erase single page and verify 0xFF", skipUnlessFlash(), async () => {
  const flasher = makeFlasher();
  // Erase the last page of flash (safe area, unlikely to brick)
  const target = await detectConnectedTarget();
  const pageSize = target.flash.pageSize;
  const eraseAddr = target.flash.start + target.flash.size - pageSize;

  await flasher.erasePage(eraseAddr);
  await flasher.setConfig(0); // back to read mode

  // Verify first word of erased page is 0xFFFFFFFF
  const val = await getAdi().readMem32(eraseAddr);
  assert.equal(val, 0xFFFFFFFF, `Erased page should read 0xFFFFFFFF, got 0x${val.toString(16)}`);
});

test("flash: program small image and verify", skipUnlessFlash(), async () => {
  const { parsed, imageMap } = loadFirmwareHex("zephyr.hex");
  const flasher = makeFlasher();

  // Program the firmware
  await flasher.programImage(parsed);

  // Verify
  await flasher.verifyImage(parsed);
  console.log("  Flash + verify: OK");
});

test("flash: program → verify → reset → verify again", skipUnlessFlash(), async () => {
  const { parsed } = loadFirmwareHex("zephyr.hex");
  const flasher = makeFlasher();

  // Program
  await flasher.programImage(parsed);
  // Verify before reset
  await flasher.verifyImage(parsed);

  // Reset
  await getAdi().writeMem32(0xe000ed0c, 0x05fa0004); // SYSRESETREQ
  await new Promise(r => setTimeout(r, 500));

  // Reconnect SWD (target may reset bus)
  try {
    await getAdi().reconnectSwd();
  } catch { /* may need a second attempt */
    await new Promise(r => setTimeout(r, 500));
    await getAdi().reconnectSwd();
  }

  // Verify after reset
  await flasher.verifyImage(parsed);
  console.log("  Program → Verify → Reset → Verify: OK");
});

import { detectConnectedTarget } from "./probe.mjs";

test.after(async () => {
  await teardown();
});