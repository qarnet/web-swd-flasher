/**
 * Verification script: flash firmware/xiao_ble_nrf52840_sense.hex, then
 * exercise the spam command via DAP UART.
 *
 * Usage: node tools/spam-verify.mjs
 */
import { openProbeTransport } from "./node-probe-transport.mjs";
import { CmsisDapCore } from "../src/backends/cmsis-dap/dap-core.js";
import { AdiSession } from "../src/backends/cmsis-dap/adi.js";
import { Nrf52FlashProgrammer } from "../src/backends/cmsis-dap/flash-nrf52.js";
import { DapUartSession } from "../src/backends/cmsis-dap/dap-uart.js";
import { RttClient } from "../src/rtt/rtt-client.js";
import { EventBus } from "../src/core/event-bus.js";
import { detectTarget } from "../src/targets/target-registry.js";
import { parseIntelHexFileText } from "../src/hex/intel-hex-parser.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEX_PATH = resolve(__dirname, "../firmware/xiao_ble_nrf52840_sense.hex");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function decode(bytes) {
  return new TextDecoder().decode(bytes);
}

// Collect UART output for up to `timeoutMs`, stop early if predicate returns true
async function collectUart(uart, timeoutMs, stopOn = null) {
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const st = await uart.status();
    if (st.rxCount > 0) {
      const { rxData } = await uart.transfer(new Uint8Array(0), st.rxCount);
      buf += decode(rxData);
      if (stopOn && stopOn(buf)) break;
    }
    await sleep(20);
  }
  return buf;
}

async function sendLine(uart, line) {
  const bytes = new TextEncoder().encode(line + "\r");
  await uart.send(bytes);
}

async function main() {
  console.log("Opening probe...");
  const probeResult = await openProbeTransport();
  console.log(`  Probe: ${probeResult.name} (${probeResult.type})`);

  const core = new CmsisDapCore(probeResult.transport, 1_000_000);
  const adi = new AdiSession(core);

  await core.connect();
  await adi.connectSwd();

  // Check DAP UART capability (bit 7)
  const caps = core._caps;
  const hasUart = !!(caps & 0x80);
  console.log(`  Caps: 0x${caps?.toString(16) ?? "?"} — DAP UART: ${hasUart}`);

  // --- Flash ---
  console.log("\nFlashing firmware/xiao_ble_nrf52840_sense.hex...");
  const hexText = readFileSync(HEX_PATH, "utf-8");
  const parsed = parseIntelHexFileText(hexText);
  const bus = new EventBus();
  bus.on("*", ({ topic, data }) => {
    if (topic === "flash:progress") process.stdout.write(`\r  ${data.phase} ${Math.round((data.done / data.total) * 100)}%   `);
  });
  const flasher = new Nrf52FlashProgrammer(bus, adi);
  await flasher.programImage(parsed);
  console.log("\n  Programmed. Verifying...");
  await flasher.verifyImage(parsed);
  console.log("  Verified OK.");

  // Reset target
  console.log("\nResetting target...");
  await adi.writeMem32(0xe000ed0c, 0x05fa0004);
  await sleep(1500);

  if (!hasUart) {
    console.log("\n⚠  Probe has no DAP UART capability — checking RTT logs instead.");
    try {
      await adi.reconnectSwd();
    } catch {
      await sleep(500);
      await adi.reconnectSwd();
    }
    const { target } = await detectTarget(adi);
    const rtt = new RttClient(adi);
    const found = await rtt.search(target.ram.start, target.ram.size);
    if (found) {
      console.log(`  RTT control block at 0x${rtt.controlBlockAddr.toString(16)}`);
      // Read a couple seconds of RTT logs
      for (let i = 0; i < 10; i++) {
        const chunk = await rtt.readUpChannel(0);
        if (chunk.length > 0) process.stdout.write(decode(chunk));
        await sleep(200);
      }
    } else {
      console.log("  RTT control block not found.");
    }
    console.log("\nSkipping spam test — DAP UART not available on this probe.");
    await core.disconnect();
    await probeResult.transport.close();
    return;
  }

  // --- DAP UART ---
  try {
    await adi.reconnectSwd();
  } catch {
    await sleep(500);
    await adi.reconnectSwd();
  }

  console.log("\nOpening DAP UART at 115200...");
  const uart = new DapUartSession(core);
  await uart.open({ baudRate: 115200 });

  // Wait for prompt
  let boot = await collectUart(uart, 3000, buf => buf.includes("> "));
  console.log("  Boot output:", JSON.stringify(boot.trim()));

  // --- Test 1: ping ---
  console.log("\n[1] ping");
  await sendLine(uart, "ping");
  const pong = await collectUart(uart, 1000, buf => buf.includes("pong"));
  console.log("  Response:", JSON.stringify(pong.trim()));
  console.assert(pong.includes("pong"), "FAIL: no pong response");

  // --- Test 2: spam small binary ---
  console.log("\n[2] spam 256 binary delay=1");
  await sendLine(uart, "spam 256 binary last_data=\"DONE\\r\\n\" 1");
  const spamOut = await collectUart(uart, 5000, buf => buf.includes("DONE") || buf.includes("complete"));
  console.log("  Spam output tail:", JSON.stringify(spamOut.slice(-120)));
  const gotComplete = spamOut.includes("complete") || spamOut.includes("DONE");
  console.assert(gotComplete, "FAIL: spam did not complete");

  // --- Test 3: spam hex format ---
  console.log("\n[3] spam 128 hex last_data=\"END\\r\\n\" 1");
  await sendLine(uart, "spam 128 hex last_data=\"END\\r\\n\" 1");
  const hexOut = await collectUart(uart, 3000, buf => buf.includes("END") || buf.includes("complete"));
  console.log("  Hex spam tail:", JSON.stringify(hexOut.slice(-80)));
  const hexDone = hexOut.includes("complete") || hexOut.includes("END");
  console.assert(hexDone, "FAIL: hex spam did not complete");

  // --- Test 4: spam stop ---
  console.log("\n[4] spam 999999 binary delay=100, then spam stop");
  await sendLine(uart, "spam 999999 binary 1");
  await sleep(300);
  await sendLine(uart, "spam stop");
  const stopOut = await collectUart(uart, 2000, buf => buf.includes("stopped"));
  console.log("  Stop output:", JSON.stringify(stopOut.slice(-80)));
  console.assert(stopOut.includes("stopped"), "FAIL: spam stop did not report stopped");

  // --- Test 5: spam 0 bytes ---
  console.log("\n[5] spam 0 bytes (edge case)");
  await sendLine(uart, "spam 0 binary last_data=\"ZERO\\r\\n\" 1");
  const zeroOut = await collectUart(uart, 2000, buf => buf.includes("complete") || buf.includes("ZERO"));
  console.log("  Zero spam output:", JSON.stringify(zeroOut.slice(-80)));

  await uart.close();
  await core.disconnect();
  await probeResult.transport.close();

  console.log("\n=== spam verification complete ===");
}

main().catch(err => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
