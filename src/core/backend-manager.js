import { CmsisDapBackend } from "../backends/cmsis-dap/backend.js";

export class BackendManager {
  constructor(progressBus, logger = null) {
    this.progressBus = progressBus;
    this.logger = logger;
    this.current = null;
    this.swdClockHz = 1000000;
  }

  setSwdClockHz(hz) {
    this.swdClockHz = hz;
  }

  setBackend(name) {
    this.current = new CmsisDapBackend(this.progressBus, this.logger, this.swdClockHz);
    return this.current;
  }

  getBackend(name = "cmsis-dap") {
    if (!this.current) {
      this.current = this.setBackend(name);
    }
    return this.current;
  }
}