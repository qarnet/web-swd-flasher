import { openProbeTransport } from "../../node-probe-transport.mjs";
import { CmsisDapCore } from "../../../src/backends/cmsis-dap/dap-core.js";
import { AdiSession } from "../../../src/backends/cmsis-dap/adi.js";
import { Nrf52FlashProgrammer } from "../../../src/backends/cmsis-dap/flash-nrf52.js";
import { Nrf52Recovery } from "../../../src/backends/cmsis-dap/nrf52-recovery.js";
import { DapCortex } from "../../../src/backends/cmsis-dap/dap-cortex.js";
import { DapUartSession } from "../../../src/backends/cmsis-dap/dap-uart.js";
import { TARGETS, detectTarget } from "../../../src/targets/target-registry.js";
import { parseIntelHexFileText } from "../../../src/hex/intel-hex-parser.js";
import { buildImageMap } from "../../../src/hex/image-map.js";
import { EventBus } from "../../../src/core/event-bus.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { VERBOSE } from "./flags.mjs";

let probeResult = null;
let core = null;
let adi = null;
let connected = false;

export async function openProbe() {
  const logger = VERBOSE ? (msg) => console.log(`  [dap] ${msg}`) : null;
  probeResult = await openProbeTransport(logger);
  core = new CmsisDapCore(probeResult.transport, 1_000_000);
  adi = new AdiSession(core);
  const { dpidr } = await core.connect();
  await adi.connectSwd();
  connected = true;
  return { transport: probeResult.transport, core, adi, dpidr };
}

export function getCore() { return core; }
export function getAdi() { return adi; }

export async function ensureConnected() {
  if (!connected || !adi) {
    throw new Error("Not connected — call openProbe() first");
  }
  return adi;
}

export function makeFlasher() {
  const bus = new EventBus();
  return new Nrf52FlashProgrammer(bus, adi);
}

export function makeRecovery() {
  return new Nrf52Recovery(adi);
}

export function makeCortex() {
  return new DapCortex(adi);
}

export async function detectConnectedTarget() {
  return detectTarget(adi);
}

export function getCapabilities() {
  return core._caps;
}

export async function teardown() {
  if (probeResult) {
    try {
      if (core) await core.disconnect();
    } catch { /* ignore */ }
    try {
      await probeResult.transport.close();
    } catch { /* ignore */ }
    probeResult = null;
    core = null;
    adi = null;
    connected = false;
  }
}

export function loadFirmwareHex(filename) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const fixturePath = resolve(__dirname, "../../test-fixtures", filename);
  const text = readFileSync(fixturePath, "utf-8");
  const parsed = parseIntelHexFileText(text);
  const imageMap = buildImageMap(parsed);
  return { parsed, imageMap };
}

process.on("exit", () => {
  if (probeResult) {
    try { probeResult.transport.close(); } catch { /* sync close best-effort */ }
  }
});