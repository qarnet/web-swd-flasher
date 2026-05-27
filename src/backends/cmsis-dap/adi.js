export class AdiSession {
  constructor(dapCore) {
    this.dapCore = dapCore;
  }

  async connectSwd() {
    return { ok: true, mode: "swd" };
  }

  async readDpidr() {
    return 0x2ba01477;
  }
}
