import { createBackend } from "../backends/backend-registry.js";

export class BackendManager {
  constructor(bus, logger = null) {
    this.bus = bus;
    this.logger = logger;
    this.current = null;
    this.swdClockHz = 1000000;
  }

  setSwdClockHz(hz) {
    this.swdClockHz = hz;
  }

  setBackend(name) {
    this.current = createBackend(name, {
      bus: this.bus,
      logger: this.logger,
      swdClockHz: this.swdClockHz,
    });
    return this.current;
  }

  getBackend(name = "cmsis-dap") {
    if (!this.current) {
      this.current = this.setBackend(name);
    }
    return this.current;
  }
}
