import test from "node:test";
import assert from "node:assert/strict";
import { Nrf52FlashProgrammer } from "../../src/backends/cmsis-dap/flash-nrf52.js";

class FakeAdi {
  constructor() {
    this.mem = new Map();
    this.writes = [];
    this.blockWrites = [];
    this.blockReads = [];
  }

  async selectAp() {}

  async readMem32(addr) {
    if (addr === Nrf52FlashProgrammer.NVMC_READY) {
      return 1;
    }
    return this.mem.get(addr) ?? 0xffffffff;
  }

  async writeMem32(addr, value) {
    this.writes.push({ addr, value });
    this.mem.set(addr, value >>> 0);
  }

  get maxBlockWordCount() {
    return 14;
  }

  get maxReadBlockWordCount() {
    return 15;
  }

  async writeMemBlockFast(address, words, offset = 0, count = words.length - offset, onChunk = null) {
    this.blockWrites.push({ address, offset, count, words: Array.from(words.slice(offset, offset + count)) });
    const chunkSize = this.maxBlockWordCount;
    let written = 0;
    while (written < count) {
      const chunk = Math.min(chunkSize, count - written);
      for (let i = 0; i < chunk; i += 1) {
        this.mem.set(address + (written + i) * 4, words[offset + written + i]);
      }
      written += chunk;
      if (onChunk) onChunk(written, count);
    }
  }

  async readMemBlockFast(address, wordCount) {
    this.blockReads.push({ address, wordCount });
    const result = new Uint32Array(wordCount);
    for (let i = 0; i < wordCount; i += 1) {
      result[i] = this.mem.get(address + i * 4) ?? 0xffffffff;
    }
    return result;
  }
}

function makeImage() {
  const data = new Map();
  data.set(0x00026000, 0x11);
  data.set(0x00026001, 0x22);
  data.set(0x00026002, 0x33);
  data.set(0x00026003, 0x44);
  data.set(0x00026010, 0xaa);
  return {
    byteCount: 5,
    addresses: [0x00026000, 0x00026001, 0x00026002, 0x00026003, 0x00026010],
    data
  };
}

test("flash programmer erases and writes image words", async () => {
  const adi = new FakeAdi();
  const bus = { emit() {} };
  const flasher = new Nrf52FlashProgrammer(bus, adi);
  const image = makeImage();
  await flasher.programImage(image);
  const firstWord = adi.mem.get(0x00026000);
  const secondWord = adi.mem.get(0x00026010);
  assert.equal(firstWord, 0x44332211);
  assert.equal(secondWord, 0xffffffaa);
});

test("flash verify validates programmed content", async () => {
  const adi = new FakeAdi();
  const bus = { emit() {} };
  const flasher = new Nrf52FlashProgrammer(bus, adi);
  const image = makeImage();
  adi.mem.set(0x00026000, 0x44332211);
  adi.mem.set(0x00026010, 0xffffffaa);
  await flasher.verifyImage(image);
});

test("flash programmer uses block writes when available", async () => {
  const adi = new FakeAdi();
  const bus = { emit() {} };
  const flasher = new Nrf52FlashProgrammer(bus, adi);
  const image = makeImage();
  await flasher.programImage(image);
  assert.ok(adi.blockWrites.length > 0, "expected block writes to be used");
  const firstWord = adi.mem.get(0x00026000);
  assert.equal(firstWord, 0x44332211);
});

test("flash verify uses block reads when available", async () => {
  const adi = new FakeAdi();
  const bus = { emit() {} };
  const flasher = new Nrf52FlashProgrammer(bus, adi);
  const image = makeImage();
  adi.mem.set(0x00026000, 0x44332211);
  adi.mem.set(0x00026010, 0xffffffaa);
  await flasher.verifyImage(image);
  assert.ok(adi.blockReads.length > 0, "expected block reads to be used");
});

function makeLargeImage() {
  const data = new Map();
  // 2048 words = 8192 bytes starting at 0x26000, all byte value 0x01
  for (let i = 0; i < 2048 * 4; i++) {
    data.set(0x00026000 + i, 0x01);
  }
  const addresses = [];
  for (let i = 0; i < 2048 * 4; i++) {
    addresses.push(0x00026000 + i);
  }
  return {
    byteCount: 2048 * 4,
    addresses,
    data
  };
}

test("progress events throttled to every 1024 words during write", async () => {
  const adi = new FakeAdi();
  const events = [];
  const bus = {
    emit(topic, e) {
      if (topic && e.kind === "program" && e.message && e.message.startsWith("Programmed")) {
        events.push(e);
      }
    }
  };
  const flasher = new Nrf52FlashProgrammer(bus, adi);
  const image = makeLargeImage();
  await flasher.programImage(image);
  assert.equal(events.length, 2, `expected 2 progress events but got ${events.length}`);
});

test("final 100 percent event always emitted for small images", async () => {
  const adi = new FakeAdi();
  const programEvents = [];
  const bus = {
    emit(topic, e) {
      if (topic && e.kind === "program") programEvents.push(e);
    }
  };
  const flasher = new Nrf52FlashProgrammer(bus, adi);
  const image = makeImage();
  await flasher.programImage(image);
  const last = programEvents[programEvents.length - 1];
  assert.equal(last.percent, 100);
});

test("NVMC restored to read mode after programming", async () => {
  const adi = new FakeAdi();
  const bus = { emit() {} };
  const flasher = new Nrf52FlashProgrammer(bus, adi);
  const image = makeImage();
  await flasher.programImage(image);
  const nvmcWrites = adi.writes.filter(w => w.addr === Nrf52FlashProgrammer.NVMC_CONFIG);
  const lastNvmcWrite = nvmcWrites[nvmcWrites.length - 1];
  assert.ok(lastNvmcWrite, "expected at least one write to NVMC_CONFIG");
  assert.equal(lastNvmcWrite.value, 0, "NVMC_CONFIG should end at 0 (read mode)");
});

test("verify throws on mismatch with address info", async () => {
  const adi = new FakeAdi();
  const bus = { emit() {} };
  const flasher = new Nrf52FlashProgrammer(bus, adi);
  const image = makeImage();
  // Do not program - FakeAdi returns 0xffffffff for unknown addresses
  await assert.rejects(
    async () => flasher.verifyImage(image),
    (err) => {
      assert.ok(err.message.includes("0x26000"), `expected "0x26000" in: ${err.message}`);
      assert.ok(err.message.toLowerCase().includes("expected"), `expected "expected" in: ${err.message}`);
      return true;
    }
  );
});
