const CMSIS_DAP_FILTERS = [{ vendorId: 0x0d28 }];

export class CmsisDapWebUsbTransport {
  constructor() {
    this.device = null;
    this.interfaceNumber = null;
    this.endpointIn = null;
    this.endpointOut = null;
    this.packetSize = 64;
  }

  async requestDevice() {
    this.device = await navigator.usb.requestDevice({ filters: CMSIS_DAP_FILTERS });
    return this.device;
  }

  async open() {
    if (!this.device) {
      throw new Error("No CMSIS-DAP device selected");
    }
    await this.device.open();
    if (!this.device.configuration) {
      await this.device.selectConfiguration(1);
    }

    const iface = this.device.configuration.interfaces.find((candidate) => {
      return candidate.alternates.some((alt) => alt.endpoints.some((ep) => ep.type === "bulk"));
    });

    if (!iface) {
      throw new Error("No bulk CMSIS-DAP interface found");
    }

    this.interfaceNumber = iface.interfaceNumber;
    await this.device.claimInterface(this.interfaceNumber);

    const alt = iface.alternates.find((candidate) => candidate.endpoints.some((ep) => ep.type === "bulk"));
    const inEp = alt.endpoints.find((ep) => ep.direction === "in" && ep.type === "bulk");
    const outEp = alt.endpoints.find((ep) => ep.direction === "out" && ep.type === "bulk");

    if (!inEp || !outEp) {
      throw new Error("CMSIS-DAP bulk endpoints not found");
    }

    this.endpointIn = inEp.endpointNumber;
    this.endpointOut = outEp.endpointNumber;
    this.packetSize = inEp.packetSize || 64;
  }

  async close() {
    if (!this.device) {
      return;
    }
    if (this.interfaceNumber !== null) {
      try {
        await this.device.releaseInterface(this.interfaceNumber);
      } catch {
        // Ignore teardown failures.
      }
    }
    await this.device.close();
    this.interfaceNumber = null;
    this.endpointIn = null;
    this.endpointOut = null;
  }

  async write(frame) {
    const data = new Uint8Array(this.packetSize);
    data.set(frame.slice(0, this.packetSize));
    await this.device.transferOut(this.endpointOut, data);
  }

  async read(length = this.packetSize) {
    const result = await this.device.transferIn(this.endpointIn, length);
    return new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);
  }
}
