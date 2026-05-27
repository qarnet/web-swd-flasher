import { MockBackend } from "../backends/mock-backend.js";
import { JLinkWebUsbBackend } from "../backends/jlink-webusb/backend.js";
import { CmsisDapBackend } from "../backends/cmsis-dap/backend.js";

export class BackendManager {
  constructor(progressBus, logger = null) {
    this.progressBus = progressBus;
    this.logger = logger;
    this.current = null;
  }

  setBackend(name) {
    if (name === "mock") {
      this.current = new MockBackend(this.progressBus);
      return this.current;
    }
    if (name === "jlink-webusb") {
      this.current = new JLinkWebUsbBackend(this.progressBus, this.logger);
      return this.current;
    }
    if (name === "cmsis-dap") {
      this.current = new CmsisDapBackend(this.progressBus, this.logger);
      return this.current;
    }
    throw new Error(`Unsupported backend: ${name}`);
  }

  getBackend(name = "mock") {
    if (!this.current) {
      this.current = this.setBackend(name);
    }
    return this.current;
  }
}
