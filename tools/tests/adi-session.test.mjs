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
}

test("adi readMemBlock returns little-endian bytes", async () => {
  const core = new FakeCore();
  const adi = new AdiSession(core);
  const bytes = await adi.readMemBlock(0x10000000, 8);
  assert.deepEqual(Array.from(bytes), [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
});
