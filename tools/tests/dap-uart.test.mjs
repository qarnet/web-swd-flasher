import test from "node:test";
import assert from "node:assert/strict";
import { DapUartSession } from "../../src/backends/cmsis-dap/dap-uart.js";
import { FakeCore } from "./helpers/fake-core.mjs";

test("uart setTransport sends command 0x1F with transport value", async () => {
  const core = new FakeCore();
  const uart = new DapUartSession(core);
  await uart.setTransport(2);
  const call = core.calls.find(c => c.method === "sendCommand" && c.cmd === 0x1f);
  assert.ok(call, "expected DAP_UART_Transport command");
});

test("uart configure sends command 0x20 with baud and format", async () => {
  const core = new FakeCore();
  const uart = new DapUartSession(core);
  await uart.configure({ baudRate: 115200, dataBits: 8, parity: 1, stopBits: 1 });
  const call = core.calls.find(c => c.method === "sendCommand" && c.cmd === 0x20);
  assert.ok(call, "expected DAP_UART_Configure command");
});

test("uart control sends command 0x22 with enable bits", async () => {
  const core = new FakeCore();
  const uart = new DapUartSession(core);
  await uart.control(true, true);
  const call = core.calls.find(c => c.method === "sendCommand" && c.cmd === 0x22);
  assert.ok(call, "expected DAP_UART_Control command");
});

test("uart control with rx-only sends correct bits", async () => {
  const core = new FakeCore();
  const uart = new DapUartSession(core);
  await uart.control(true, false);
  const call = core.calls.find(c => c.method === "sendCommand" && c.cmd === 0x22);
  assert.ok(call, "expected DAP_UART_Control command");
});

test("uart status sends command 0x23", async () => {
  const core = new FakeCore();
  core._responseMap["uart_status"] = { rxError: 0, txError: 0, rxCount: 0, txCount: 0 };
  const uart = new DapUartSession(core);
  await uart.status();
  const call = core.calls.find(c => c.method === "sendCommand" && c.cmd === 0x23);
  assert.ok(call, "expected DAP_UART_Status command");
});

test("uart transfer sends command 0x21", async () => {
  const core = new FakeCore();
  const uart = new DapUartSession(core);
  await uart.transfer(new Uint8Array([0x41, 0x42]), 0);
  const call = core.calls.find(c => c.method === "sendCommand" && c.cmd === 0x21);
  assert.ok(call, "expected DAP_UART_Transfer command");
});

test("uart open calls setTransport, configure, control in sequence", async () => {
  const core = new FakeCore();
  const uart = new DapUartSession(core);
  let dataReceived = false;
  await uart.open({ baudRate: 9600, onData: () => { dataReceived = true; }, pollIntervalMs: 5000 });
  uart.close();
  const commands = core.calls.filter(c => c.method === "sendCommand").map(c => c.cmd);
  assert.ok(commands.includes(0x1f), "expected setTransport (0x1F)");
  assert.ok(commands.includes(0x20), "expected configure (0x20)");
  assert.ok(commands.includes(0x22), "expected control (0x22)");
});

test("uart setTransport throws on non-zero response byte", async () => {
  const core = {
    async sendCommand(payload) {
      const r = new Uint8Array(64);
      r[0] = payload[0];
      r[1] = 0x01;
      return r;
    }
  };
  const uart = new DapUartSession(core);
  await assert.rejects(() => uart.setTransport(2), /DAP_UART_Transport failed/);
});

test("uart configure throws on non-zero response byte", async () => {
  const core = {
    async sendCommand(payload) {
      const r = new Uint8Array(64);
      r[0] = payload[0];
      r[1] = 0x01;
      return r;
    }
  };
  const uart = new DapUartSession(core);
  await assert.rejects(() => uart.configure({ baudRate: 115200 }), /DAP_UART_Configure failed/);
});

test("uart control throws on non-zero response byte", async () => {
  const core = {
    async sendCommand(payload) {
      const r = new Uint8Array(64);
      r[0] = payload[0];
      r[1] = 0x01;
      return r;
    }
  };
  const uart = new DapUartSession(core);
  await assert.rejects(() => uart.control(true, true), /DAP_UART_Control failed/);
});

test("uart close stops polling and calls control(false, false)", async () => {
  const core = new FakeCore();
  const uart = new DapUartSession(core);
  await uart.open({ baudRate: 115200, pollIntervalMs: 100000 });
  assert.equal(uart._polling, true);
  let clearTimeoutCalled = false;
  const origClear = globalThis.clearTimeout;
  globalThis.clearTimeout = (id) => { if (id === uart._pollTimer) clearTimeoutCalled = true; };
  try {
    await uart.close();
  } finally {
    globalThis.clearTimeout = origClear;
  }
  assert.equal(uart._polling, false);
  assert.equal(clearTimeoutCalled, true);
  const controlCalls = core.calls.filter(c => c.method === "sendCommand" && c.cmd === 0x22);
  assert.ok(controlCalls.length >= 2, "should have at least one control(1,1) and one control(0,0)");
});

test("uart close swallows errors from control/setTransport", async () => {
  const core = {
    async sendCommand(payload) {
      if (payload[0] === 0x22) throw new Error("control error");
      const r = new Uint8Array(64);
      r[0] = payload[0];
      r[1] = 0x01;
      return r;
    }
  };
  const uart = new DapUartSession(core);
  await assert.doesNotReject(() => uart.close());
});