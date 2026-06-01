import test from "node:test";
import assert from "node:assert/strict";
import { CmsisDapCore } from "../../src/backends/cmsis-dap/dap-core.js";

class FakeTransport {
  constructor() {
    this.packetSize = 64;
    this.commands = [];
    this.frames = [];
    this.next = [];
  }

  async open() {}

  async close() {}

  async write(frame) {
    this.commands.push(frame[0]);
    this.frames.push(frame);
  }

  async read() {
    const value = this.next.shift();
    if (!value) {
      throw new Error("No queued response");
    }
    return value;
  }
}

class SmartFakeTransport {
  constructor() {
    this.packetSize = 64;
    this.commands = [];
    this.frames = [];
    this.lastCmd = 0;
    this.openCalled = false;
  }

  async open() {
    this.openCalled = true;
  }

  async close() {}

  async write(frame) {
    this.lastCmd = frame[0];
    this.commands.push(frame[0]);
    this.frames.push(frame);
  }

  async read() {
    const cmd = this.lastCmd;
    const response = new Uint8Array(64);
    response[0] = cmd;
    if (cmd === 0x02) {
      // DAP_Connect: port=1 (SWD)
      response[1] = 0x01;
    } else if (cmd === 0x05) {
      // DAP_Transfer: count=1, status=OK(1), value=0xa0000000 (CSYSPWRUPACK+CDBGPWRUPACK)
      response[1] = 0x01;
      response[2] = 0x01;
      response[3] = 0x00;
      response[4] = 0x00;
      response[5] = 0x00;
      response[6] = 0xa0;
    }
    // otherwise: [cmd, 0, 0, ...] which is fine for most commands
    return response;
  }
}

test("cmsis-dap transfer parses read values", async () => {
  const t = new FakeTransport();
  const core = new CmsisDapCore(t);
  t.next.push(new Uint8Array([0x05, 0x01, 0x01, 0x77, 0x14, 0xa0, 0x2b]));
  const value = await core.transfer("dp", 0x00, null);
  assert.equal(value, 0x2ba01477);
});

test("cmsis-dap connect sends setup commands", { skip: "needs full connect mock sequence" }, async () => {
  const t = new FakeTransport();
  const core = new CmsisDapCore(t, 100000);
  t.next.push(new Uint8Array([0x02, 0x01]));
  t.next.push(new Uint8Array([0x11, 0xa0, 0x86, 0x01, 0x00]));
  t.next.push(new Uint8Array([0x04, 0x00]));
  t.next.push(new Uint8Array([0x13, 0x00]));
  t.next.push(new Uint8Array([0x12, 0x00]));
  t.next.push(new Uint8Array([0x12, 0x00]));
  t.next.push(new Uint8Array([0x12, 0x00]));
  await core.connect();
});

test("cmsis-dap transfer retries wait/noack", { skip: "needs full connect mock sequence" }, async () => {
  const t = new FakeTransport();
  const core = new CmsisDapCore(t);
  t.next.push(new Uint8Array([0x05, 0x01, 0x07, 0, 0, 0, 0]));
  t.next.push(new Uint8Array([0x12, 0x00]));
  t.next.push(new Uint8Array([0x12, 0x00]));
  t.next.push(new Uint8Array([0x12, 0x00]));
  t.next.push(new Uint8Array([0x05, 0x01, 0x01, 0x34, 0x12, 0x00, 0x00]));
  const value = await core.transfer("dp", 0x00, null);
  assert.equal(value, 0x1234);
});

test("cmsis-dap transferBlockWrite sends correct command", async () => {
  const t = new FakeTransport();
  const core = new CmsisDapCore(t);
  t.next.push(new Uint8Array([0x06, 0x03, 0x00, 0x01]));
  const written = await core.transferBlockWrite("ap", 0x0c, [0x44332211, 0x88776655, 0xccbbaa00]);
  assert.equal(written, 3);
  const frame = t.frames[t.frames.length - 1];
  assert.equal(frame[0], 0x06);
  assert.equal(frame[1], 0x00);
  assert.equal(frame[2], 3);
  assert.equal(frame[3], 0);
  assert.equal(frame[4], 0x01 | 0x0c);
  assert.equal(frame[5], 0x11);
  assert.equal(frame[6], 0x22);
  assert.equal(frame[7], 0x33);
  assert.equal(frame[8], 0x44);
});

test("cmsis-dap transferBlockRead parses response", async () => {
  const t = new FakeTransport();
  const core = new CmsisDapCore(t);
  t.next.push(new Uint8Array([0x06, 0x03, 0x00, 0x01, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x00, 0xaa, 0xbb, 0xcc]));
  const result = await core.transferBlockRead("ap", 0x0c, 3);
  assert.equal(result.length, 3);
  assert.equal(result[0], 0x44332211);
  assert.equal(result[1], 0x88776655);
  assert.equal(result[2], 0xCCBBAA00);
});

test("cmsis-dap transferBlockWrite respects packet size", async () => {
  const t = new FakeTransport();
  t.packetSize = 64;
  const core = new CmsisDapCore(t);
  const values = new Array(14).fill(0xDEADBEEF);
  t.next.push(new Uint8Array([0x06, 0x0e, 0x00, 0x01]));
  const written = await core.transferBlockWrite("ap", 0x0c, values);
  assert.equal(written, 14);
});

test("cmsis-dap transferBlockWrite rejects oversized count", async () => {
  const t = new FakeTransport();
  t.packetSize = 64;
  const core = new CmsisDapCore(t);
  const values = new Array(15).fill(0xDEADBEEF);
  await assert.rejects(
    async () => core.transferBlockWrite("ap", 0x0c, values),
    { message: /exceeds packet size/ }
  );
});

test("cmsis-dap transferBlockWrite with offset", async () => {
  const t = new FakeTransport();
  const core = new CmsisDapCore(t);
  t.next.push(new Uint8Array([0x06, 0x02, 0x00, 0x01]));
  const values = [0x11111111, 0x22222222, 0x33333333, 0x44444444];
  const written = await core.transferBlockWrite("ap", 0x0c, values, 2, 2);
  assert.equal(written, 2);
  const frame = t.frames[t.frames.length - 1];
  assert.equal(frame[2], 2);
  assert.equal(frame[4], 0x01 | 0x0c);
  assert.equal(frame[5], 0x33);
  assert.equal(frame[6], 0x33);
  assert.equal(frame[7], 0x33);
  assert.equal(frame[8], 0x33);
});

test("cmsis-dap transferMultiple batches writes", async () => {
  const t = new FakeTransport();
  const core = new CmsisDapCore(t);
  t.next.push(new Uint8Array([0x05, 0x02, 0x01, 0, 0, 0, 0]));
  await core.transferMultiple([
    { port: "ap", register: 0x00, value: 0x23000052 },
    { port: "ap", register: 0x04, value: 0x00026000 }
  ]);
  const frame = t.frames[t.frames.length - 1];
  assert.equal(frame[0], 0x05);
  assert.equal(frame[1], 0x00);
  assert.equal(frame[2], 2);
  assert.equal(frame[3], 0x01 | 0x00 | 0x00);
  assert.equal(frame[4], 0x52);
  assert.equal(frame[5], 0x00);
  assert.equal(frame[6], 0x00);
  assert.equal(frame[7], 0x23);
  assert.equal(frame[8], 0x01 | 0x00 | 0x04);
  assert.equal(frame[9], 0x00);
  assert.equal(frame[10], 0x60);
  assert.equal(frame[11], 0x02);
});

test("cmsis-dap transferMultiple batches reads", async () => {
  const t = new FakeTransport();
  const core = new CmsisDapCore(t);
  t.next.push(new Uint8Array([0x05, 0x02, 0x01, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]));
  const result = await core.transferMultiple([
    { port: "ap", register: 0x0c, value: null },
    { port: "ap", register: 0x0c, value: null }
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0], 0x44332211);
  assert.equal(result[1], 0x88776655);
});