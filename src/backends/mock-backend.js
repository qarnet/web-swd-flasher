import { ProbeBackend } from "./backend-interface.js";
import { Topics } from "../core/event-bus-topics.js";
import { TARGETS } from "../targets/target-registry.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockBackend extends ProbeBackend {
  constructor(bus) {
    super();
    this._bus = bus;
    this.connected = false;
    this._activeTarget = TARGETS.find((t) => t.id === "nrf52840");
  }

  get activeTarget() {
    return this._activeTarget;
  }

  get availableTargets() {
    return TARGETS;
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
    this._bus.emit(Topics.BACKEND_PROGRESS, { percent: 100 });
  }

  async disconnect() {
    await sleep(40);
    this.connected = false;
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
    this._bus.emit(Topics.FLASH_PROGRESS, { kind: "program", percent: 5, message: "Preparing program" });
    await sleep(120);
    this._bus.emit(Topics.FLASH_PROGRESS, { kind: "program", percent: 60, message: `Writing ${image.byteCount} bytes` });
    await sleep(120);
    this._bus.emit(Topics.FLASH_PROGRESS, { kind: "program", percent: 100, message: "Program complete" });
  }

  async verifyImage() {
    await sleep(100);
    this._bus.emit(Topics.FLASH_PROGRESS, { kind: "verify", percent: 100, message: "Verify complete" });
  }

  async reset(mode = "run") {
    await sleep(50);
  }

  capabilities() {
    return {
      supportsReadMemory: true,
      supportsFlash: true,
      supportsVerify: true,
      supportsReset: true
    };
  }

  getMemoryAccess() {
    return {
      readMem32: async (addr) => 0xdeadbeef,
      writeMem32: async () => {},
      readBlockFast: async (addr, wordCount) => new Uint32Array(wordCount).fill(0xdeadbeef),
      maxReadBlockWordCount: 256,
    };
  }

  createRttSession() {
    return null;
  }

  getCortex() {
    return null;
  }

  getRecovery() {
    return null;
  }
}
