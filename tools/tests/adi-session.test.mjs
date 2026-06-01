import test from "node:test";
import assert from "node:assert/strict";
import { AdiSession } from "../../src/backends/cmsis-dap/adi.js";

class FakeCore {
  constructor() {
    this.calls = [];
    this.readQueue = [0x44332211, 0x88776655];
  }

  async transfer(port, register, value) {
    this.calls.push({ port, register, value });
    if (port === "ap" && register === 0x0c && value === null) {
      return this.readQueue.shift() ?? 0;
    }
    return 0;
  }

  async transferMultiple(ops) {
    const reads = [];
    for (const op of ops) {
      this.calls.push(op);
      if (op.value === null || op.value === undefined) {
        if (op.port === "dp" && op.register === 0x0c) {
          // DP RDBUFF — the actual word returned from a posted AP read
          reads.push(this.readQueue.shift() ?? 0);
        } else {
          reads.push(0);
        }
      }
    }
    return reads;
  }

  async transferBlockWrite(port, register, words, count, offset) {
    this.calls.push({ method: "transferBlockWrite", port, register, count, offset });
    return count;
  }
}

test("adi readMemBlock returns little-endian bytes", async () => {
  const core = new FakeCore();
  const adi = new AdiSession(core);
  const bytes = await adi.readMemBlock(0x10000000, 8);
  assert.deepEqual(Array.from(bytes), [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
});

test("writeMemBlockFast calls onChunk after each chunk with correct done count", async () => {
  const core = new FakeCore();
  core.transport = { packetSize: 64 };
  const adi = new AdiSession(core);
  // maxBlockWordCount = floor((64-5)/4) = 14
  const words = new Uint32Array(30).fill(0xdeadbeef);
  const chunkCalls = [];
  await adi.writeMemBlockFast(0x26000, words, 0, 30, (done, total) => {
    chunkCalls.push({ done, total });
  });
  assert.ok(chunkCalls.length > 1, `expected multiple chunk calls, got ${chunkCalls.length}`);
  const last = chunkCalls[chunkCalls.length - 1];
  assert.equal(last.done, 30);
  assert.equal(last.total, 30);
});

test("writeMemBlockFast onChunk done count is cumulative across 1KB boundary", async () => {
  const core = new FakeCore();
  core.transport = { packetSize: 64 };
  const adi = new AdiSession(core);
  // 512 words at 0x20000000 (1KB aligned). maxBlockWordCount=14, wordsToKbBoundary=256.
  // Chunks: 14,14,...,4 (18 chunks) for first 256 words, then repeat for next 256.
  const words = new Uint32Array(512).fill(0x12345678);
  const chunkCalls = [];
  await adi.writeMemBlockFast(0x20000000, words, 0, 512, (done, total) => {
    chunkCalls.push({ done, total });
  });
  // The last call should report done=512, total=512
  const last = chunkCalls[chunkCalls.length - 1];
  assert.equal(last.done, 512);
  assert.equal(last.total, 512);
  // There should be calls from both 1KB regions: at least ceil(256/14)*2 = 37 calls
  assert.ok(chunkCalls.length > 18, `expected calls spanning two 1KB regions, got ${chunkCalls.length}`);
});

test("reconnectSwd delegates to dapCore and resets apSelect", async () => {
  const core = new FakeCore();
  core.reconnectSwd = async () => { core.reconnectCalled = true; };
  const adi = new AdiSession(core);
  // Set apSelect to a non-zero value to verify it gets reset
  adi.apSelect = 0x01000000;
  await adi.reconnectSwd();
  assert.equal(core.reconnectCalled, true);
  assert.equal(adi.apSelect, 0);
});
