const CMSIS_DAP_HID_FILTERS = [
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
  { usagePage: 0xff00, usage: 0x01 },
];

export class CmsisDapWebHidTransport {
  constructor(logger = null) {
    this.device = null;
    this.packetSize = 64;
    this.log = logger;
    this.readQueue = [];
    this.readWaiters = [];
    this.onInputReport = this.onInputReport.bind(this);
    this.inputReportId = 0;
    this.outputReportId = 0;
  }

  debug(message, payload = null) {
    if (this.log) {
      this.log(`[cmsis-dap-webhid] ${message}${payload ? ` ${JSON.stringify(payload)}` : ""}`, true);
    }
  }

  async requestDevice() {
    const known = await navigator.hid.getDevices();
    this.debug("authorized-devices", known.map((d) => ({ vendorId: d.vendorId, productId: d.productId, productName: d.productName })));
    const cached = known.find((dev) =>
      CMSIS_DAP_HID_FILTERS.some((f) => f.vendorId !== undefined && dev.vendorId === f.vendorId && dev.productId === f.productId)
    );
    if (cached) {
      this.device = cached;
      return this.device;
    }
    const picked = await navigator.hid.requestDevice({ filters: CMSIS_DAP_HID_FILTERS });
    if (!picked.length) {
      throw new Error("No HID device selected");
    }
    this.device = picked[0];
    const hasHidCollection = (this.device.collections || []).length > 0;
    if (!hasHidCollection) {
      throw new Error("Selected device has no HID collections");
    }
    this.debug("requestDevice-selected", { vendorId: this.device.vendorId, productId: this.device.productId, productName: this.device.productName });
    return this.device;
  }

  async getAuthorizedDevices() {
    return navigator.hid.getDevices();
  }

  async open() {
    if (!this.device) {
      throw new Error("No CMSIS-DAP HID device selected");
    }
    await this.device.open();
    const reportInfo = this.resolveReportInfo();
    this.inputReportId = reportInfo.inputReportId;
    this.outputReportId = reportInfo.outputReportId;
    this.packetSize = reportInfo.packetSize;
    this.device.addEventListener("inputreport", this.onInputReport);
    this.debug("device-opened", {
      opened: this.device.opened,
      packetSize: this.packetSize,
      inputReportId: this.inputReportId,
      outputReportId: this.outputReportId
    });
  }

  resolveReportInfo() {
    let inputReportId = 0;
    let outputReportId = 0;

    for (const col of this.device.collections || []) {
      if (col.outputReports?.length) {
        outputReportId = col.outputReports[0].reportId ?? 0;
      }
      if (col.inputReports?.length) {
        inputReportId = col.inputReports[0].reportId ?? 0;
      }
    }

    return { inputReportId, outputReportId, packetSize: 64 };
  }

  async close() {
    if (!this.device) return;
    this.device.removeEventListener("inputreport", this.onInputReport);
    await this.device.close();
    this.debug("device-closed");
  }

  onInputReport(event) {
    const bytes = new Uint8Array(event.data.buffer.slice(0));
    if (this.readWaiters.length > 0) {
      const resolve = this.readWaiters.shift();
      resolve(bytes);
    } else {
      this.readQueue.push(bytes);
    }
  }

  async write(frame) {
    const out = new Uint8Array(this.packetSize);
    out.set(frame.slice(0, this.packetSize));
    await this.device.sendReport(this.outputReportId, out);
  }

  async read() {
    if (this.readQueue.length > 0) {
      return this.readQueue.shift();
    }
    return new Promise((resolve) => this.readWaiters.push(resolve));
  }
}
