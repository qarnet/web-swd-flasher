import test from "node:test";
import assert from "node:assert/strict";
import { openProbe, teardown, makeRecovery, makeFlasher, getAdi, loadFirmwareHex } from "./probe.mjs";
import { RECOVERY_TEST } from "./flags.mjs";

let probeError = null;
let connected = false;

try {
  await openProbe();
  connected = true;
} catch (err) {
  probeError = err.message;
}

function skipUnlessRecovery() {
  if (probeError) return { skip: probeError };
  if (!connected) return { skip: "SWD connect failed" };
  if (!RECOVERY_TEST) return { skip: "Pass --recovery-test to enable (very destructive — mass erase)" };
  return {};
}

test("recovery: mass erase unlocks device", skipUnlessRecovery(), async () => {
  const recovery = makeRecovery();
  const result = await recovery.eraseAll(() => {});
  assert.equal(result.unlocked, true, "Device should be unlocked after mass erase");
  console.log("  Mass erase completed, device unlocked.");
});

test("recovery: re-program after mass erase", skipUnlessRecovery(), async () => {
  const { parsed } = loadFirmwareHex("zephyr.hex");
  const flasher = makeFlasher();

  // Program the firmware after recovery
  await flasher.programImage(parsed);
  await flasher.verifyImage(parsed);
  console.log("  Re-programmed after recovery: OK");
});

test.after(async () => {
  await teardown();
});