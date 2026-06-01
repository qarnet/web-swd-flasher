/**
 * Node.js probe transport — auto-detects CMSIS-DAP probes and returns an open
 * transport compatible with CmsisDapCore. Tries USB bulk (CMSIS-DAP v2) first,
 * falls back to HID (CMSIS-DAP v1).
 *
 * Usage:
 *   const { transport, info } = await openProbeTransport();
 *   const core = new CmsisDapCore(transport);
 *   // ... use core ...
 *   await transport.close();
 */

// VID/PID list mirrored from the browser transports.
const CMSIS_DAP_FILTERS = [
  { vendorId: 0x0d28, productId: 0x0204 },
  { vendorId: 0x2e8a, productId: 0x0004 },
  { vendorId: 0x2e8a, productId: 0x000c },
  { vendorId: 0x2e8a, productId: 0xf00a },
  { vendorId: 0xc251, productId: 0x2750 },
  { vendorId: 0x1fc9, productId: 0x0090 },
  { vendorId: 0x1fc9, productId: 0x0143 },
  { vendorId: 0x03eb, productId: 0x2111 },
  { vendorId: 0x03eb, productId: 0x2140 },
  { vendorId: 0x03eb, productId: 0x2141 },
  { vendorId: 0x03eb, productId: 0x2144 },
  { vendorId: 0x03eb, productId: 0x2145 },
  { vendorId: 0x03eb, productId: 0x216c },
  { vendorId: 0x03eb, productId: 0x2175 },
  { vendorId: 0x04b4, productId: 0xf138 },
  { vendorId: 0x04b4, productId: 0xf148 },
  { vendorId: 0x04b4, productId: 0xf151 },
  { vendorId: 0x04b4, productId: 0xf152 },
  { vendorId: 0x04b4, productId: 0xf154 },
  { vendorId: 0x04b4, productId: 0xf155 },
  { vendorId: 0x04b4, productId: 0xf166 },
  { vendorId: 0x0483, productId: 0x3748 },
  { vendorId: 0x0483, productId: 0x374b },
  { vendorId: 0x0483, productId: 0x374d },
  { vendorId: 0x0483, productId: 0x374e },
  { vendorId: 0x0483, productId: 0x374f },
  { vendorId: 0x0483, productId: 0x3752 },
  { vendorId: 0x0483, productId: 0x3753 },
  { vendorId: 0x0483, productId: 0x3754 },
  { vendorId: 0x0483, productId: 0x3755 },
  { vendorId: 0x0483, productId: 0x3757 },
  { vendorId: 0x0483, productId: 0x572a },
  { vendorId: 0x30cc, productId: 0x9527 },
];

function matchesFilter(vid, pid) {
  return CMSIS_DAP_FILTERS.some(f => f.vendorId === vid && f.productId === pid);
}

// ---------------------------------------------------------------------------
// USB bulk transport (CMSIS-DAP v2) — uses the 'usb' package WebUSB compat layer
// ---------------------------------------------------------------------------

async function tryUsbBulk(logger) {
  let WebUSB;
  try {
    ({ WebUSB } = await import("usb"));
  } catch {
    return null;
  }

  const webusb = new WebUSB({ allowAllDevices: true });
  const devices = await webusb.getDevices();
  const dapDevice = devices.find(d => matchesFilter(d.vendorId, d.productId));
  if (!dapDevice) return null;

  const { CmsisDapWebUsbTransport } = await import("../src/backends/cmsis-dap/transport-webusb.js");
  const transport = new CmsisDapWebUsbTransport(logger);
  transport.useDevice(dapDevice);
  return {
    transport,
    type: "usb-bulk",
    name: dapDevice.productName || `${dapDevice.vendorId.toString(16)}:${dapDevice.productId.toString(16)}`,
  };
}

// ---------------------------------------------------------------------------
// HID transport (CMSIS-DAP v1) — wraps node-hid with the same open/read/write API
// ---------------------------------------------------------------------------

class NodeHidTransport {
  constructor(vid, pid, logger) {
    this.vid = vid;
    this.pid = pid;
    this.log = logger;
    this.device = null;
    this.packetSize = 64;
  }

  async open() {
    const { HIDAsync } = await import("node-hid");
    this.device = await HIDAsync.open(this.vid, this.pid);
  }

  async close() {
    await this.device?.close();
    this.device = null;
  }

  async write(frame) {
    // node-hid write prepends a report-ID byte (0x00 for non-numbered reports)
    const out = Buffer.alloc(this.packetSize + 1);
    out[0] = 0x00;
    for (let i = 0; i < Math.min(frame.length, this.packetSize); i++) out[i + 1] = frame[i];
    await this.device.write(out);
  }

  async read() {
    const buf = await this.device.read();
    return new Uint8Array(buf);
  }
}

async function tryHid(logger) {
  let hidDevices;
  try {
    const { default: HID } = await import("node-hid");
    hidDevices = HID.devices();
  } catch {
    return null;
  }

  const found = hidDevices.find(d => matchesFilter(d.vendorId, d.productId));
  if (!found) return null;

  const transport = new NodeHidTransport(found.vendorId, found.productId, logger);
  return {
    transport,
    type: "hid",
    name: found.product || `${found.vendorId.toString(16)}:${found.productId.toString(16)}`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find and open the first available CMSIS-DAP probe.
 *
 * @param {Function|null} logger - optional log function (string) => void
 * @returns {{ transport, type: string, name: string }}
 * @throws if no probe is found or cannot be opened
 */
export async function openProbeTransport(logger = null) {
  const result = (await tryUsbBulk(logger)) ?? (await tryHid(logger));
  if (!result) {
    throw new Error(
      "No CMSIS-DAP probe found. Ensure the probe is plugged in and you have access to the USB device.\n" +
      "On Linux you may need a udev rule, e.g.:\n" +
      '  SUBSYSTEM=="usb", ATTR{idVendor}=="0d28", MODE="0666", GROUP="plugdev"'
    );
  }
  await result.transport.open();
  return result;
}
