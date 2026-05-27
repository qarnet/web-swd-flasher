import { ProbeBackend } from "./backend-interface.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockBackend extends ProbeBackend {
  constructor(progressBus) {
    super();
    this.progressBus = progressBus;
    this.connected = false;
  }

  async requestDevice() {
    await sleep(50);
    return { selected: true };
  }

  async getAuthorizedDevices() {
    return [{ mock: true }];
  }

  async connect() {
    await sleep(120);
    this.connected = true;
    this.progressBus.emit({ type: "connect", percent: 100, message: "Mock probe connected" });
  }

  async disconnect() {
    await sleep(40);
    this.connected = false;
    this.progressBus.emit({ type: "disconnect", percent: 100, message: "Mock probe disconnected" });
  }

  async getProbeInfo() {
    return {
      backend: "mock",
      name: "Mock Probe",
      transport: "simulated"
    };
  }

  async getTargetInfo() {
    return {
      family: "nRF52",
      part: "nRF52840",
      id: "MOCK-1234",
      ficr: {
        part: 0x52840,
        variant: 0x41414141,
        package: 0x2000,
        ram: 256,
        flash: 1024
      }
    };
  }

  async readMemory(addr, len) {
    const result = new Uint8Array(len);
    result.fill(addr & 0xff);
    return result;
  }

  async programImage(image) {
    this.progressBus.emit({ type: "program", percent: 5, message: "Preparing program" });
    await sleep(120);
    this.progressBus.emit({ type: "program", percent: 60, message: `Writing ${image.byteCount} bytes` });
    await sleep(120);
    this.progressBus.emit({ type: "program", percent: 100, message: "Program complete" });
  }

  async verifyImage() {
    await sleep(100);
    this.progressBus.emit({ type: "verify", percent: 100, message: "Verify complete" });
  }

  async reset(mode = "run") {
    await sleep(50);
    this.progressBus.emit({ type: "reset", percent: 100, message: `Reset: ${mode}` });
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
