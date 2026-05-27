import test from "node:test";
import assert from "node:assert/strict";
import { CmsisDapCore } from "../../src/backends/cmsis-dap/dap-core.js";

class FakeTransport {
  constructor() {
    this.packetSize = 64;
    this.commands = [];
    this.next = [];
  }

  async open() {}

  async close() {}

  async write(frame) {
    this.commands.push(frame[0]);
  }

  async read() {
    const value = this.next.shift();
    if (!value) {
      throw new Error("No queued response");
    }
    return value;
  }
}

test("cmsis-dap transfer parses read values", async () => {
  const t = new FakeTransport();
  const core = new CmsisDapCore(t);
  t.next.push(new Uint8Array([0x05, 0x01, 0x01, 0x77, 0x14, 0xa0, 0x2b]));
  const value = await core.transfer("dp", 0x00, null);
  assert.equal(value, 0x2ba01477);
});

test("cmsis-dap connect sends setup commands", async () => {
  const t = new FakeTransport();
  const core = new CmsisDapCore(t);
  t.next.push(new Uint8Array([0x02, 0x01]));
  t.next.push(new Uint8Array([0x11, 0x00]));
  t.next.push(new Uint8Array([0x04, 0x00]));
  t.next.push(new Uint8Array([0x13, 0x00]));
  t.next.push(new Uint8Array([0x12, 0x00]));
  t.next.push(new Uint8Array([0x12, 0x00]));
  t.next.push(new Uint8Array([0x12, 0x00]));
  await core.connect();
  assert.deepEqual(t.commands, [0x02, 0x11, 0x04, 0x13, 0x12, 0x12, 0x12]);
});
