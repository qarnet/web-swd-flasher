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

export class CmsisDapWebUsbTransport {
  constructor(logger = null) {
    this.device = null;
    this.interfaceNumber = null;
    this.endpointIn = null;
    this.endpointOut = null;
    this.packetSize = 64;
    this.log = logger;
  }

  debug(message, payload = null) {
    if (this.log) {
      this.log(`[cmsis-dap] ${message}${payload ? ` ${JSON.stringify(payload)}` : ""}`, true);
    }
  }

  async diagnoseClaimFailures() {
    if (!this.device?.configuration) {
      return;
    }
    for (const iface of this.device.configuration.interfaces) {
      const n = iface.interfaceNumber;
      try {
        await this.device.claimInterface(n);
        this.debug("diagnose-claim-ok", { interfaceNumber: n });
        try {
          await this.device.releaseInterface(n);
        } catch (err) {
          this.debug("diagnose-release-failed", {
            interfaceNumber: n,
            name: err?.name,
            message: err?.message
          });
        }
      } catch (err) {
        this.debug("diagnose-claim-failed", {
          interfaceNumber: n,
          name: err?.name,
          message: err?.message
        });
      }
    }
  }

  async requestDevice() {
    const known = await navigator.usb.getDevices();
    this.debug("authorized-devices", known.map((d) => ({ vid: d.vendorId, pid: d.productId, name: d.productName })));
    const cached = known.find((dev) =>
      CMSIS_DAP_FILTERS.some((f) => dev.vendorId === f.vendorId && dev.productId === f.productId)
    );
    if (cached) {
      this.device = cached;
      return this.device;
    }
    this.device = await navigator.usb.requestDevice({ filters: CMSIS_DAP_FILTERS });
    this.debug("requestDevice-selected", { vid: this.device.vendorId, pid: this.device.productId, name: this.device.productName });
    return this.device;
  }

  async getAuthorizedDevices() {
    return navigator.usb.getDevices();
  }

  useDevice(device) {
    this.device = device;
    return this.device;
  }

  async open() {
    if (!this.device) {
      throw new Error("No CMSIS-DAP device selected");
    }
    await this.device.open();
    this.debug("device-opened", { opened: this.device.opened });
    if (!this.device.configuration) {
      await this.device.selectConfiguration(1);
      this.debug("configuration-selected", { value: 1 });
    }

    this.debug(
      "interfaces",
      this.device.configuration.interfaces.map((iface) => ({
        interfaceNumber: iface.interfaceNumber,
        alternates: iface.alternates.map((alt) => ({
          alternateSetting: alt.alternateSetting,
          classCode: alt.interfaceClass,
          subClass: alt.interfaceSubclass,
          protocol: alt.interfaceProtocol,
          endpoints: alt.endpoints.map((ep) => ({ direction: ep.direction, type: ep.type, number: ep.endpointNumber, packetSize: ep.packetSize }))
        }))
      }))
    );

    const iface = this.device.configuration.interfaces.find((candidate) => {
      return candidate.alternates.some((alt) => alt.endpoints.some((ep) => ep.type === "bulk"));
    });

    if (!iface) {
      throw new Error("No bulk CMSIS-DAP interface found");
    }

    this.interfaceNumber = iface.interfaceNumber;
    this.debug("claim-interface-attempt", { interfaceNumber: this.interfaceNumber });
    try {
      await this.device.claimInterface(this.interfaceNumber);
      this.debug("claim-interface-ok", { interfaceNumber: this.interfaceNumber });
    } catch (error) {
      this.debug("claim-interface-failed", {
        interfaceNumber: this.interfaceNumber,
        name: error?.name,
        message: error?.message
      });
      await this.diagnoseClaimFailures();
      throw error;
    }

    const alt = iface.alternates.find((candidate) => candidate.endpoints.some((ep) => ep.type === "bulk"));
    const inEp = alt.endpoints.find((ep) => ep.direction === "in" && ep.type === "bulk");
    const outEp = alt.endpoints.find((ep) => ep.direction === "out" && ep.type === "bulk");

    if (!inEp || !outEp) {
      throw new Error("CMSIS-DAP bulk endpoints not found");
    }

    this.endpointIn = inEp.endpointNumber;
    this.endpointOut = outEp.endpointNumber;
    this.packetSize = inEp.packetSize || 64;
    this.debug("endpoints-selected", { in: this.endpointIn, out: this.endpointOut, packetSize: this.packetSize });
  }

  async close() {
    if (!this.device) {
      return;
    }
    if (this.interfaceNumber !== null) {
      try {
        await this.device.releaseInterface(this.interfaceNumber);
        this.debug("release-interface-ok", { interfaceNumber: this.interfaceNumber });
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
    if (this.endpointOut === null) {
      throw new Error("CMSIS-DAP transport not open");
    }
    const data = new Uint8Array(this.packetSize);
    data.set(frame.slice(0, this.packetSize));
    await this.device.transferOut(this.endpointOut, data);
  }

  async read(length = this.packetSize) {
    if (this.endpointIn === null) {
      throw new Error("CMSIS-DAP transport not open");
    }
    const result = await this.device.transferIn(this.endpointIn, length);
    return new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);
  }
}
