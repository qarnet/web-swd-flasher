import test from "node:test";
import assert from "node:assert/strict";
import { openProbe, teardown, makeFlasher, getAdi, getCore, loadFirmwareHex } from "./probe.mjs";
import { FLASH_TEST } from "./flags.mjs";
import { RttClient } from "../../../src/rtt/rtt-client.js";
import { detectConnectedTarget } from "./probe.mjs";

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

const RTT_MAGIC_STRING = "RTT feedback firmware started.";

test("rtt-loopback: flash firmware, reset, find RTT control block", skipUnlessFlash(), async () => {
  const { parsed } = loadFirmwareHex("zephyr.hex");
  const flasher = makeFlasher();
  const adi = getAdi();

  // Program the firmware
  await flasher.programImage(parsed);
  await flasher.verifyImage(parsed);
  console.log("  Firmware programmed and verified.");

  // Reset the target
  await adi.writeMem32(0xe000ed0c, 0x05fa0004); // SYSRESETREQ
  await new Promise(r => setTimeout(r, 1000)); // wait for boot

  // Re-connect SWD
  try {
    await adi.reconnectSwd();
  } catch {
    await new Promise(r => setTimeout(r, 500));
    await adi.reconnectSwd();
  }

  // Search for RTT control block in RAM
  const { target } = await detectConnectedTarget();
  const ramStart = target.ram.start;
  const ramSize = target.ram.size;

  const rtt = new RttClient(adi);
  const found = await rtt.search(ramStart, ramSize);

  assert.ok(found, "RTT control block should be found in RAM after firmware boot");
  console.log(`  RTT control block found at 0x${rtt.controlBlockAddr.toString(16)}`);
  console.log(`  Up channels: ${rtt._upChannels.length}, Down channels: ${rtt._downChannels.length}`);
});

test("rtt-loopback: read RTT output contains magic string", skipUnlessFlash(), async () => {
  const adi = getAdi();
  const { target } = await detectConnectedTarget();
  const ramStart = target.ram.start;
  const ramSize = target.ram.size;

  const rtt = new RttClient(adi);
  const found = await rtt.search(ramStart, ramSize);
  if (!found) {
    // Try resetting again and searching
    await adi.writeMem32(0xe000ed0c, 0x05fa0004);
    await new Promise(r => setTimeout(r, 1000));
    try { await adi.reconnectSwd(); } catch {
      await new Promise(r => setTimeout(r, 500));
      await adi.reconnectSwd();
    }
    const found2 = await rtt.search(ramStart, ramSize);
    assert.ok(found2, "RTT control block still not found after reset");
  }

  // Poll for data
  const received = [];
  rtt.on("data", ({ channel, data }) => {
    const text = new TextDecoder().decode(data);
    received.push(text);
  });

  rtt.startPolling(50);
  // Wait up to 5 seconds for the magic string
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 100));
    const combined = received.join("");
    if (combined.includes(RTT_MAGIC_STRING)) break;
  }
  rtt.stop();

  const combined = received.join("");
  assert.ok(combined.includes(RTT_MAGIC_STRING),
    `RTT output should contain "${RTT_MAGIC_STRING}", got: ${combined.slice(0, 200)}`);
  console.log(`  RTT output: ${combined.slice(0, 100)}...`);
});

test.after(async () => {
  await teardown();
});