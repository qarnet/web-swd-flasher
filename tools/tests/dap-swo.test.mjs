import test from "node:test";
import assert from "node:assert/strict";
import { DapSwoSession } from "../../src/backends/cmsis-dap/dap-swo.js";
import { FakeCore } from "./helpers/fake-core.mjs";

test("swo setTransport sends command 0x17", async () => {
  const core = new FakeCore();
  const swo = new DapSwoSession(core);
  await swo.setTransport(1);
  const call = core.calls.find(c => c.method === "sendCommand" && c.cmd === 0x17);
  assert.ok(call, "expected DAP_SWO_Transport command");
});

test("swo setMode sends command 0x18", async () => {
  const core = new FakeCore();
  const swo = new DapSwoSession(core);
  await swo.setMode(1);
  const call = core.calls.find(c => c.method === "sendCommand" && c.cmd === 0x18);
  assert.ok(call, "expected DAP_SWO_Mode command");
});

test("swo setBaudrate sends command 0x19", async () => {
  const core = new FakeCore();
  const swo = new DapSwoSession(core);
  await swo.setBaudrate(115200);
  const call = core.calls.find(c => c.method === "sendCommand" && c.cmd === 0x19);
  assert.ok(call, "expected DAP_SWO_Baudrate command");
});

test("swo setControl sends command 0x1A", async () => {
  const core = new FakeCore();
  const swo = new DapSwoSession(core);
  await swo.setControl(true);
  const call = core.calls.find(c => c.method === "sendCommand" && c.cmd === 0x1a);
  assert.ok(call, "expected DAP_SWO_Control command");
});

test("swo status sends command 0x1B", async () => {
  const core = new FakeCore();
  const swo = new DapSwoSession(core);
  await swo.status();
  const call = core.calls.find(c => c.method === "sendCommand" && c.cmd === 0x1b);
  assert.ok(call, "expected DAP_SWO_Status command");
});

test("swo readData sends command 0x1C", async () => {
  const core = new FakeCore();
  const swo = new DapSwoSession(core);
  await swo.readData(64);
  const call = core.calls.find(c => c.method === "sendCommand" && c.cmd === 0x1c);
  assert.ok(call, "expected DAP_SWO_Data command");
});