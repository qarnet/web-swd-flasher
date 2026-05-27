const JLINK_FILTERS = [{ vendorId: 0x1366 }];

export class JLinkWebUsbTransport {
  constructor() {
    this.device = null;
    this.interfaceNumber = null;
    this.endpointIn = null;
    this.endpointOut = null;
  }

  async requestDevice() {
    this.device = await navigator.usb.requestDevice({ filters: JLINK_FILTERS });
    return this.device;
  }

  async open() {
    if (!this.device) {
      throw new Error("No J-Link device selected");
    }
    await this.device.open();
    if (!this.device.configuration) {
      await this.device.selectConfiguration(1);
    }

    const iface = this.device.configuration.interfaces.find((candidate) => {
      return candidate.alternates.some((alt) => alt.endpoints.some((ep) => ep.type === "bulk"));
    });

    if (!iface) {
      throw new Error("No bulk interface found on selected J-Link device");
    }

    this.interfaceNumber = iface.interfaceNumber;
    await this.device.claimInterface(this.interfaceNumber);

    const alt = iface.alternates.find((candidate) => candidate.endpoints.some((ep) => ep.type === "bulk"));
    const inEp = alt.endpoints.find((ep) => ep.direction === "in" && ep.type === "bulk");
    const outEp = alt.endpoints.find((ep) => ep.direction === "out" && ep.type === "bulk");

    if (!inEp || !outEp) {
      throw new Error("Bulk IN/OUT endpoints not found on selected interface");
    }

    this.endpointIn = inEp.endpointNumber;
    this.endpointOut = outEp.endpointNumber;
  }

  async close() {
    if (!this.device) {
      return;
    }
    if (this.interfaceNumber !== null) {
      try {
        await this.device.releaseInterface(this.interfaceNumber);
      } catch {
        // Ignore release errors on disconnect path.
      }
    }
    await this.device.close();
    this.interfaceNumber = null;
    this.endpointIn = null;
    this.endpointOut = null;
  }

  async transferOut(data) {
    if (this.endpointOut === null) {
      throw new Error("Transport not open");
    }
    return this.device.transferOut(this.endpointOut, data);
  }

  async transferIn(length) {
    if (this.endpointIn === null) {
      throw new Error("Transport not open");
    }
    return this.device.transferIn(this.endpointIn, length);
  }
}
