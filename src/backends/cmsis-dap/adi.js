export class AdiSession {
  constructor(dapCore) {
    this.dapCore = dapCore;
  }

  async connectSwd() {
    return { ok: true, mode: "swd" };
  }

  async readDpidr() {
    return this.dapCore.transfer("dp", 0x00, null);
  }
}
