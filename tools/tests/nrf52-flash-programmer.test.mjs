import test from "node:test";
import assert from "node:assert/strict";
import { Nrf52FlashProgrammer } from "../../src/backends/cmsis-dap/flash-nrf52.js";

class FakeAdi {
  constructor() {
    this.mem = new Map();
    this.writes = [];
  }

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
