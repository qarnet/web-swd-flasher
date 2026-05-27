export class JLinkWebUsbClient {
  constructor(transport) {
    this.transport = transport;
  }

  async connect() {
    await this.transport.open();
  }

  async disconnect() {
    await this.transport.close();
  }

  async getProbeInfo() {
    const device = this.transport.device;
    return {
      backend: "jlink-webusb",
      name: device?.productName || "J-Link",
      manufacturer: device?.manufacturerName || "SEGGER",
      vendorId: device?.vendorId,
      productId: device?.productId,
      transport: "webusb-bulk"
    };
  }

  async ping() {
    // Minimal placeholder for first protocol smoke. Real command sequence TBD.
    return { ok: true };
  }
}
