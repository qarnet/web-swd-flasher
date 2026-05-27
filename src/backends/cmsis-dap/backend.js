import { ProbeBackend } from "../backend-interface.js";
import { CmsisDapWebUsbTransport } from "./transport-webusb.js";
import { CmsisDapCore } from "./dap-core.js";
import { AdiSession } from "./adi.js";
import { Nrf52Target } from "./nrf52-target.js";
import { Nrf52FlashProgrammer } from "./flash-nrf52.js";

export class CmsisDapBackend extends ProbeBackend {
  constructor(progressBus, logger = null) {
    super();
    this.transport = new CmsisDapWebUsbTransport(logger);
    this.core = new CmsisDapCore(this.transport);
    this.adi = new AdiSession(this.core);
    this.target = new Nrf52Target(this.adi);
    this.flash = new Nrf52FlashProgrammer(progressBus, this.adi);
  }

  async requestDevice() {
    return this.transport.requestDevice();
  }

  async getAuthorizedDevices() {
    return this.transport.getAuthorizedDevices();
  }

  async connect() {
    await this.core.connect();
    await this.adi.connectSwd();
  }

  async disconnect() {
    await this.core.disconnect();
  }

  async getProbeInfo() {
    const info = await this.core.dapInfo();
    return {
      backend: "cmsis-dap",
      name: this.transport.device?.productName || "CMSIS-DAP",
      manufacturer: this.transport.device?.manufacturerName || "Unknown",
      transport: info.transport,
      packetSize: info.packetSize
    };
  }

  async getTargetInfo() {
    return this.target.identify();
  }

  async readMemory(addr, len) {
    return this.adi.readMemBlock(addr, len);
  }

  async programImage(image, options) {
    return this.flash.programImage(image, options);
  }

  async verifyImage(image, options) {
    return this.flash.verifyImage(image, options);
  }

  async reset(mode = "run") {
    if (mode === "run") {
      await this.adi.writeMem32(0xe000ed0c, 0x05fa0004);
      return { mode: "run", method: "sysresetreq" };
    }
    return { mode };
  }

  capabilities() {
    return {
      supportsReadMemory: true,
      supportsFlash: true,
      supportsVerify: true,
      supportsReset: true
    };
  }
}
