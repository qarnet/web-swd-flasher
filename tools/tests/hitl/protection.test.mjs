import test from "node:test";
import assert from "node:assert/strict";
import { openProbe, teardown, makeRecovery } from "./probe.mjs";

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

test("protection: checkProtection returns valid status", skipIfNoProbe(), async () => {
  const recovery = makeRecovery();
  const result = await recovery.checkProtection();
  assert.ok(typeof result.locked === "boolean", "locked should be boolean");
  assert.ok(typeof result.apProtectStatus === "number", "apProtectStatus should be number");
  console.log(`  Protection: ${result.locked ? "LOCKED" : "Unlocked"} (APPROTECTSTATUS=0x${result.apProtectStatus.toString(16)})`);
});

test.after(async () => {
  await teardown();
});