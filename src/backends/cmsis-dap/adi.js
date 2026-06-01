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
    const results = await this.dapCore.transferMultiple([
      { port: "ap", register, value: null },
      { port: "dp", register: 0x0c, value: null }
    ]);
    return results[1];
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
    // Batch all 4 ops into 1 USB round-trip: [SELECT?], CSW write, TAR write,
    // AP DRW posted read, DP RDBUFF read. Returns RDBUFF (the actual value).
    const ops = [];
    if (this.apSelect !== 0) {
      ops.push({ port: "dp", register: 0x08, value: 0 });
      this.apSelect = 0;
    }
    ops.push(
      { port: "ap", register: 0x00, value: 0x23000052 },
      { port: "ap", register: 0x04, value: address >>> 0 },
      { port: "ap", register: 0x0c, value: null },
      { port: "dp", register: 0x0c, value: null }
    );
    const reads = await this.dapCore.transferMultiple(ops);
    return reads[reads.length - 1];
  }

  async writeMem32(address, value) {
    // Batch all 3 ops into 1 USB round-trip: [SELECT?], CSW write, TAR write, DRW write.
    const ops = [];
    if (this.apSelect !== 0) {
      ops.push({ port: "dp", register: 0x08, value: 0 });
      this.apSelect = 0;
    }
    ops.push(
      { port: "ap", register: 0x00, value: 0x23000052 },
      { port: "ap", register: 0x04, value: address >>> 0 },
      { port: "ap", register: 0x0c, value: value >>> 0 }
    );
    await this.dapCore.transferMultiple(ops);
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

  async writeMemBlock(address, bytes) {
    let current = address >>> 0;
    for (let i = 0; i < bytes.length; i += 4) {
      const b0 = bytes[i] ?? 0xff;
      const b1 = bytes[i + 1] ?? 0xff;
      const b2 = bytes[i + 2] ?? 0xff;
      const b3 = bytes[i + 3] ?? 0xff;
      const value = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
      await this.writeMem32(current, value);
      current += 4;
    }
  }

  get maxBlockWordCount() {
    const packetSize = this.dapCore.transport.packetSize;
    return Math.max(1, Math.floor((packetSize - 5) / 4));
  }

  get maxReadBlockWordCount() {
    const packetSize = this.dapCore.transport.packetSize;
    return Math.max(1, Math.floor((packetSize - 4) / 4));
  }

  async writeMemWordByWord(address, words, offset = 0, count = words.length - offset) {
    await this.selectAp(0, 0);
    let addr = address >>> 0;
    for (let i = 0; i < count; i++) {
      await this.dapCore.transferMultiple([
        { port: "ap", register: 0x00, value: 0x23000052 },
        { port: "ap", register: 0x04, value: addr },
        { port: "ap", register: 0x0c, value: words[offset + i] >>> 0 }
      ]);
      addr += 4;
    }
  }

  async writeMemBlockFast(address, words, offset = 0, count = words.length - offset) {
    const maxWords = this.maxBlockWordCount;
    let pos = offset;
    let addr = address >>> 0;
    const end = offset + count;
    while (pos < end) {
      // Clamp chunk to current 1KB region: AHB-AP TAR auto-increment only wraps bits[9:0].
      const wordsToKbBoundary = Math.max(1, (0x400 - (addr & 0x3ff)) >>> 2);
      const chunkSize = Math.min(maxWords, wordsToKbBoundary, end - pos);
      await this.selectAp(0, 0);
      await this.dapCore.transferMultiple([
        { port: "ap", register: 0x00, value: 0x23000052 },
        { port: "ap", register: 0x04, value: addr }
      ]);
      await this.dapCore.transferBlockWrite("ap", 0x0c, words, chunkSize, pos);
      pos += chunkSize;
      addr += chunkSize * 4;
    }
  }

  async readMemBlockFast(address, wordCount) {
    const maxReadWords = this.maxReadBlockWordCount;
    const result = new Uint32Array(wordCount);
    let offset = 0;
    let addr = address >>> 0;
    while (offset < wordCount) {
      // Clamp chunk to current 1KB region: AHB-AP TAR auto-increment only wraps bits[9:0].
      const wordsToKbBoundary = Math.max(1, (0x400 - (addr & 0x3ff)) >>> 2);
      const count = Math.min(maxReadWords, wordsToKbBoundary, wordCount - offset);
      await this.selectAp(0, 0);
      await this.dapCore.transferMultiple([
        { port: "ap", register: 0x00, value: 0x23000052 },
        { port: "ap", register: 0x04, value: addr }
      ]);
      const chunk = await this.dapCore.transferBlockRead("ap", 0x0c, count);
      result.set(chunk, offset);
      offset += count;
      addr += count * 4;
    }
    return result;
  }
}
