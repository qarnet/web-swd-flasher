export class AdiSession {
  constructor(dapCore) {
    this.dapCore = dapCore;
    this.apSelect = 0;
  }

  async connectSwd() {
    return { ok: true, mode: "swd" };
  }

  async readDpidr() {
    return this.dapCore.transfer("dp", 0x00, null);
  }

  async writeDp(register, value) {
    await this.dapCore.transfer("dp", register, value >>> 0);
  }

  async readAp(register) {
    return this.dapCore.transfer("ap", register, null);
  }

  async writeAp(register, value) {
    await this.dapCore.transfer("ap", register, value >>> 0);
  }

  async selectAp(apIndex, apBank = 0) {
    const selectValue = ((apIndex & 0xff) << 24) | ((apBank & 0x0f) << 4);
    if (selectValue === this.apSelect) {
      return;
    }
    this.apSelect = selectValue;
    await this.writeDp(0x08, selectValue);
  }

  async readMem32(address) {
    await this.selectAp(0, 0);
    await this.writeAp(0x00, 0x23000052);
    await this.writeAp(0x04, address >>> 0);
    return this.readAp(0x0c);
  }

  async readMemBlock(address, lengthBytes) {
    const out = new Uint8Array(lengthBytes);
    let current = address >>> 0;
    for (let i = 0; i < lengthBytes; i += 4) {
      const value = await this.readMem32(current);
      out[i] = value & 0xff;
      if (i + 1 < lengthBytes) out[i + 1] = (value >>> 8) & 0xff;
      if (i + 2 < lengthBytes) out[i + 2] = (value >>> 16) & 0xff;
      if (i + 3 < lengthBytes) out[i + 3] = (value >>> 24) & 0xff;
      current += 4;
    }
    return out;
  }
}
