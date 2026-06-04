import test from "node:test";
import assert from "node:assert/strict";
import { openProbe, teardown, getCore, getCapabilities } from "./probe.mjs";

let probeError = null;

try {
  await openProbe();
  console.log("\nProbe found. Running probe-info tests.\n");
} catch (err) {
  probeError = err.message;
  console.log(`\nNo probe: ${probeError}\nAll hardware tests will be skipped.\n`);
}

function skipIfNoProbe() {
  return probeError ? { skip: probeError } : {};
}

test("probe: DAP_Info returns capabilities", skipIfNoProbe(), async () => {
  const caps = await getCore().dapInfo();
  assert.ok(caps, "dapInfo returned null");
  assert.ok(typeof caps.packetSize === "number", "packetSize missing");
  assert.ok(caps.packetSize >= 64, `packetSize=${caps.packetSize} < 64`);
  assert.ok(typeof caps.capabilities === "number", "capabilities missing");
});

test("probe: packet size is reasonable", skipIfNoProbe(), async () => {
  const transport = getCore().transport;
  assert.ok(transport.packetSize >= 64, `packetSize=${transport.packetSize}`);
  assert.ok(transport.packetSize <= 65464, `packetSize=${transport.packetSize} too large`);
});

test("probe: capabilities include SWD", skipIfNoProbe(), async () => {
  const caps = getCapabilities();
  assert.ok(caps?.hasSWD, "Probe should support SWD");
});

test("probe: DAP_Info reports vendor and product strings", skipIfNoProbe(), async () => {
  const info = await getCore().dapInfo();
  assert.ok(info.product !== undefined, "product field should be present (may be empty on some probes)");
});

test("probe: DAP_Info reports max packet count and size", skipIfNoProbe(), async () => {
  const info = await getCore().dapInfo();
  assert.ok(typeof info.maxPacketCount === "number");
  assert.ok(typeof info.maxPacketSize === "number");
  assert.ok(info.maxPacketCount >= 1, `maxPacketCount=${info.maxPacketCount}`);
});

import { VERBOSE } from "./flags.mjs";
import { CmsisDapCore } from "../../../src/backends/cmsis-dap/dap-core.js";

test.after(async () => {
  await teardown();
});