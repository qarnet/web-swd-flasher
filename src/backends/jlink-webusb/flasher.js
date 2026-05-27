export class JLinkWebUsbFlasher {
  constructor(client, progressBus) {
    this.client = client;
    this.progressBus = progressBus;
  }

  async programImage(image) {
    this.progressBus.emit({ type: "program", percent: 5, message: "J-Link prepare" });
    await this.client.ping();
    this.progressBus.emit({ type: "program", percent: 100, message: `J-Link staged ${image.byteCount} bytes (stub)` });
  }

  async verifyImage() {
    this.progressBus.emit({ type: "verify", percent: 100, message: "J-Link verify stub complete" });
  }

  async reset(mode) {
    this.progressBus.emit({ type: "reset", percent: 100, message: `J-Link reset stub (${mode})` });
  }
}
