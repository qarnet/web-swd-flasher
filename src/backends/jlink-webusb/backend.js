import { ProbeBackend } from "../backend-interface.js";
import { JLinkWebUsbTransport } from "./transport.js";
import { JLinkWebUsbClient } from "./client.js";
import { JLinkWebUsbFlasher } from "./flasher.js";

export class JLinkWebUsbBackend extends ProbeBackend {
  constructor(bus, logger = null) {
    super();
    this.transport = new JLinkWebUsbTransport(logger);
    this.client = new JLinkWebUsbClient(this.transport);
    this.flasher = new JLinkWebUsbFlasher(this.client, bus);
  }

  async requestDevice() {
    return this.transport.requestDevice();
  }

  async getAuthorizedDevices() {
    return this.transport.getAuthorizedDevices();
  }

  async connect() {
    await this.client.connect();
  }

  async disconnect() {
    await this.client.disconnect();
  }

  async getProbeInfo() {
    return this.client.getProbeInfo();
  }

  async getTargetInfo() {
    return {
      family: "unknown",
      part: "unresolved",
      detail: "target identification pending protocol mapping"
    };
  }

  async readMemory() {
    throw new Error("J-Link readMemory not implemented");
  }

  async programImage(image, options) {
    return this.flasher.programImage(image, options);
  }

  async verifyImage(image, options) {
    return this.flasher.verifyImage(image, options);
  }

  async reset(mode = "run") {
    return this.flasher.reset(mode);
  }

  capabilities() {
    return {
      supportsReadMemory: false,
      supportsFlash: true,
      supportsVerify: true,
      supportsReset: true
    };
  }
}
