const CMSIS_DAP_HID_FILTERS = [
  { vendorId: 0x0d28 },
  { vendorId: 0x2e8a, productId: 0x000c },
  { usagePage: 0xff00 }
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
      this.log(`[cmsis-dap-webhid] ${message}${payload ? ` ${JSON.stringify(payload)}` : ""}`);
    }
  }

  async requestDevice() {
    const known = await navigator.hid.getDevices();
    this.debug("authorized-devices", known.map((d) => ({ vendorId: d.vendorId, productId: d.productId, productName: d.productName })));
    const cached = known.find((d) => d.vendorId === 0x0d28);
    if (cached) {
      this.device = cached;
      return cached;
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
