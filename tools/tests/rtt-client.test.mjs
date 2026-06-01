import test from "node:test";
import assert from "node:assert/strict";
import { RttClient } from "../../src/rtt/rtt-client.js";

// RTT magic: "SEGGER RTT\0\0\0\0\0\0" (16 bytes little-endian as 4 uint32s)
const MAGIC_WORDS = [0x47474553, 0x52205245, 0x00005454, 0x00000000];

// Control block layout (24 bytes = 6 uint32s):
//   [0..3]  magic (4 words)
//   [4]     MaxNumUpBuffers
//   [5]     MaxNumDownBuffers
// Channel descriptor (24 bytes = 6 uint32s):
//   [0] pName, [1] pBuffer, [2] SizeOfBuffer, [3] WrOff, [4] RdOff, [5] Flags
function buildControlBlock(upChannels, downChannels) {
  const cbHeader = [...MAGIC_WORDS, upChannels.length, downChannels.length];
  const chanWords = [];
  for (const ch of [...upChannels, ...downChannels]) {
    chanWords.push(ch.pName ?? 0, ch.pBuffer ?? 0x20010000, ch.size ?? 256, ch.wrOff ?? 0, ch.rdOff ?? 0, ch.flags ?? 0);
  }
  return new Uint32Array([...cbHeader, ...chanWords]);
}

class FakeAdi {
  constructor(memMap) {
    this._mem = memMap; // Map<addr, Uint32Array>
    this.maxReadBlockWordCount = 256;
  }

  async readMemBlockFast(addr, wordCount) {
    // Find which block contains this address
    for (const [base, words] of this._mem) {
      const byteOffset = addr - base;
      if (byteOffset >= 0 && byteOffset < words.byteLength) {
        const wordOffset = byteOffset / 4;
        return words.slice(wordOffset, wordOffset + wordCount);
      }
    }
    return new Uint32Array(wordCount); // zeros
  }

  async writeMem32(addr, value) {
    // Write single word into memory map
    for (const [base, words] of this._mem) {
      const byteOffset = addr - base;
      if (byteOffset >= 0 && byteOffset < words.byteLength) {
        words[byteOffset / 4] = value >>> 0;
        return;
      }
    }
  }
}

test("rtt search finds control block at start of RAM", async () => {
  const RAM_START = 0x20000000;
  const cbWords = buildControlBlock(
    [{ pBuffer: 0x20010000, size: 256, wrOff: 4, rdOff: 0 }],
    []
  );
  const mem = new Map([[RAM_START, cbWords]]);
  const adi = new FakeAdi(mem);
  const rtt = new RttClient(adi);
  const found = await rtt.search(RAM_START, 4096);
  assert.equal(found, true);
  assert.equal(rtt.controlBlockAddr, RAM_START);
  assert.equal(rtt._upChannels.length, 1);
});

test("rtt search returns false when no magic present", async () => {
  const RAM_START = 0x20000000;
  const mem = new Map([[RAM_START, new Uint32Array(256)]]);
  const adi = new FakeAdi(mem);
  const rtt = new RttClient(adi);
  const found = await rtt.search(RAM_START, 1024);
  assert.equal(found, false);
});

test("rtt _poll reads linear data correctly", async () => {
  const RAM_START = 0x20000000;
  const BUF_ADDR  = 0x20010000;
  const BUF_SIZE  = 64;
  // WrOff=8 RdOff=0 → 8 bytes to read from buffer
  const cbWords = buildControlBlock(
    [{ pBuffer: BUF_ADDR, size: BUF_SIZE, wrOff: 8, rdOff: 0 }],
    []
  );
  // Buffer content: 8 bytes = 2 words = [0x44332211, 0x88776655]
  const bufWords = new Uint32Array(BUF_SIZE / 4);
  bufWords[0] = 0x44332211;
  bufWords[1] = 0x88776655;

  const mem = new Map([
    [RAM_START, cbWords],
    [BUF_ADDR, bufWords]
  ]);
  const adi = new FakeAdi(mem);
  const rtt = new RttClient(adi);
  const found = await rtt.search(RAM_START, 4096);
  assert.equal(found, true);

  const received = [];
  rtt.on("data", ({ data }) => received.push(...data));
  await rtt._poll();
  assert.deepEqual(received, [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
});

test("rtt _poll handles ring buffer wraparound", async () => {
  const RAM_START = 0x20000000;
  const BUF_ADDR  = 0x20010000;
  const BUF_SIZE  = 16; // 4 words
  // WrOff=4 RdOff=12 → wraps: tail=[12..16), head=[0..4)
  const cbWords = buildControlBlock(
    [{ pBuffer: BUF_ADDR, size: BUF_SIZE, wrOff: 4, rdOff: 12 }],
    []
  );
  // Buffer: [0xDDCCBBAA, 0x00000000, 0x00000000, 0x44332211]
  const bufWords = new Uint32Array([0xDDCCBBAA, 0, 0, 0x44332211]);

  const mem = new Map([
    [RAM_START, cbWords],
    [BUF_ADDR, bufWords]
  ]);
  const adi = new FakeAdi(mem);
  const rtt = new RttClient(adi);
  await rtt.search(RAM_START, 4096);

  const received = [];
  rtt.on("data", ({ data }) => received.push(...data));
  await rtt._poll();
  // tail: bytes 12..16 = last word [0x44332211] → [0x11,0x22,0x33,0x44]
  // head: bytes 0..4  = first word [0xDDCCBBAA] → [0xAA,0xBB,0xCC,0xDD]
  assert.deepEqual(received, [0x11, 0x22, 0x33, 0x44, 0xAA, 0xBB, 0xCC, 0xDD]);
});
