export class Nrf52FlashProgrammer {
  constructor(progressBus) {
    this.progressBus = progressBus;
  }

  async programImage(image) {
    this.progressBus.emit({ type: "program", percent: 10, message: "CMSIS-DAP prepare" });
    this.progressBus.emit({ type: "program", percent: 100, message: `CMSIS-DAP staged ${image.byteCount} bytes (stub)` });
  }

  async verifyImage() {
    this.progressBus.emit({ type: "verify", percent: 100, message: "CMSIS-DAP verify stub complete" });
  }
}
