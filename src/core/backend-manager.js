import { MockBackend } from "../backends/mock-backend.js";

export class BackendManager {
  constructor(progressBus) {
    this.progressBus = progressBus;
    this.current = null;
  }

  setBackend(name) {
    if (name !== "mock") {
      throw new Error(`Unsupported backend: ${name}`);
    }
    this.current = new MockBackend(this.progressBus);
    return this.current;
  }

  getBackend() {
    if (!this.current) {
      this.current = new MockBackend(this.progressBus);
    }
    return this.current;
  }
}
