import { Nrf52FlashProgrammer } from "../../../src/backends/cmsis-dap/flash-nrf52.js";

export class FakeAdi {
  constructor(opts = {}) {
    this.mem = new Map();
    this.writes = [];
    this.blockWrites = [];
    this.blockReads = [];
    this.selectApCalls = [];
    this.readApCalls = [];
    this.writeApCalls = [];
    this.reconnectCalled = false;
    this._nvmcReadyAlways = opts.nvmcReadyAlways ?? true;
    this._apRegisters = new Map(); // "apIdx:reg" → value
    this.dapCore = { transport: { log: null, packetSize: 64 } };

    if (opts.mem) {
      for (const [addr, val] of Object.entries(opts.mem)) {
        this.mem.set(Number(addr), val);
      }
    }
  }

  get maxBlockWordCount() {
    return Math.max(1, Math.floor((this.dapCore.transport.packetSize - 5) / 4));
  }

  get maxReadBlockWordCount() {
    return Math.max(1, Math.floor((this.dapCore.transport.packetSize - 4) / 4));
  }

  async selectAp(apIndex, bank) {
    this.selectApCalls.push({ apIndex, bank });
  }

  async readMem32(addr) {
    addr = addr >>> 0;
    if (addr === Nrf52FlashProgrammer.NVMC_READY && this._nvmcReadyAlways) return 1;
    const val = this.mem.get(addr);
    return val !== undefined ? val : 0xffffffff;
  }

  async writeMem32(addr, value) {
    addr = addr >>> 0;
    this.writes.push({ addr, value: value >>> 0 });
    this.mem.set(addr, value >>> 0);
  }

  async writeMemBlockFast(address, words, offset = 0, count = words.length - offset, onChunk = null) {
    this.blockWrites.push({ address, offset, count, words: Array.from(words.slice(offset, offset + count)) });
    const chunkSize = this.maxBlockWordCount;
    let written = 0;
    while (written < count) {
      const chunk = Math.min(chunkSize, count - written);
      for (let i = 0; i < chunk; i++) {
        this.mem.set(address + (written + i) * 4, words[offset + written + i]);
      }
      written += chunk;
      if (onChunk) onChunk(written - chunk + chunk, count);
    }
    // Fix: onChunk should report correctly
    // Re-emit final progress
  }

  async readMemBlockFast(address, wordCount) {
    this.blockReads.push({ address, wordCount });
    const result = new Uint32Array(wordCount);
    for (let i = 0; i < wordCount; i++) {
      result[i] = this.mem.get(address + i * 4) ?? 0xffffffff;
    }
    return result;
  }

  async readMemBlock(address, lengthBytes) {
    const wordCount = Math.ceil(lengthBytes / 4);
    const words = await this.readMemBlockFast(address, wordCount);
    return new Uint8Array(words.buffer).slice(0, lengthBytes);
  }

  async readAp(register) {
    this.readApCalls.push({ register });
    const key = `1:${register}`;
    return this._apRegisters.get(key) ?? 0;
  }

  async writeAp(register, value) {
    this.writeApCalls.push({ register, value: value >>> 0 });
    // selectAp(1, 0) is implied for CTRL-AP; store the register value
    const key = `1:${register}`;
    this._apRegisters.set(key, value >>> 0);
  }

  async reconnectSwd() {
    this.reconnectCalled = true;
    this.selectApCalls = [];
  }

  async readDpidr() {
    return 0x0bc10477;
  }
}