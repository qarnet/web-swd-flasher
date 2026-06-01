import { Topics } from "../../core/event-bus-topics.js";

export class JLinkWebUsbFlasher {
  constructor(client, bus) {
    this.client = client;
    this._bus = bus;
  }

  async programImage(image) {
    this._bus.emit(Topics.FLASH_PROGRESS, { kind: "program", percent: 5, message: "J-Link prepare" });
    await this.client.ping();
    this._bus.emit(Topics.FLASH_PROGRESS, { kind: "program", percent: 100, message: `J-Link staged ${image.byteCount} bytes (stub)` });
  }

  async verifyImage() {
    this._bus.emit(Topics.FLASH_PROGRESS, { kind: "verify", percent: 100, message: "J-Link verify stub complete" });
  }

  async reset(mode) {
    this._bus.emit(Topics.FLASH_PROGRESS, { kind: "reset", percent: 100, message: `J-Link reset stub (${mode})` });
  }
}
