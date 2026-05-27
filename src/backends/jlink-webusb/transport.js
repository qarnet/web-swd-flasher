const JLINK_FILTERS = [{ vendorId: 0x1366 }];

export class JLinkWebUsbTransport {
  constructor(logger = null) {
    this.device = null;
    this.interfaceNumber = null;
    this.endpointIn = null;
    this.endpointOut = null;
    this.log = logger;
  }

  debug(message, payload = null) {
    if (this.log) {
      this.log(`[jlink-webusb] ${message}${payload ? ` ${JSON.stringify(payload)}` : ""}`);
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
    const cached = known.find((dev) => dev.vendorId === 0x1366);
    if (cached) {
      this.device = cached;
      return this.device;
    }
    this.device = await navigator.usb.requestDevice({ filters: JLINK_FILTERS });
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
      throw new Error("No J-Link device selected");
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

    const bulkIfaces = this.device.configuration.interfaces.filter((candidate) => {
      return candidate.alternates.some((alt) => alt.endpoints.some((ep) => ep.type === "bulk"));
    });

    const iface =
      bulkIfaces.find((candidate) =>
        candidate.alternates.some(
          (alt) => alt.interfaceClass === 0xff && alt.interfaceSubclass === 0xff && alt.interfaceProtocol === 0xff
        )
      ) || bulkIfaces[0];

    if (!iface) {
      throw new Error("No bulk interface found on selected J-Link device");
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

    const alt =
      iface.alternates.find(
        (candidate) =>
          candidate.endpoints.some((ep) => ep.type === "bulk") &&
          candidate.interfaceClass === 0xff &&
          candidate.interfaceSubclass === 0xff &&
          candidate.interfaceProtocol === 0xff
      ) || iface.alternates.find((candidate) => candidate.endpoints.some((ep) => ep.type === "bulk"));
    const inEp = alt.endpoints.find((ep) => ep.direction === "in" && ep.type === "bulk");
    const outEp = alt.endpoints.find((ep) => ep.direction === "out" && ep.type === "bulk");

    if (!inEp || !outEp) {
      throw new Error("Bulk IN/OUT endpoints not found on selected interface");
    }

    this.endpointIn = inEp.endpointNumber;
    this.endpointOut = outEp.endpointNumber;
    this.debug("endpoints-selected", { in: this.endpointIn, out: this.endpointOut });
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
