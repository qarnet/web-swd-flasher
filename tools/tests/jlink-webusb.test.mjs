import test from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../../src/core/event-bus.js";
import { Topics } from "../../src/core/event-bus-topics.js";
import { JLinkWebUsbBackend } from "../../src/backends/jlink-webusb/backend.js";
import { JLinkWebUsbClient } from "../../src/backends/jlink-webusb/client.js";
import { JLinkWebUsbFlasher } from "../../src/backends/jlink-webusb/flasher.js";

function makeFakeTransport(overrides = {}) {
  const transport = {
    _opened: false,
    _closed: false,
    device: overrides.device || { productName: "J-Link", manufacturerName: "SEGGER", vendorId: 0x1366, productId: 0x0101 },
    open: async function() { this._opened = true; },
    close: async function() { this._closed = true; },
    requestDevice: async function() { return this.device; },
    getAuthorizedDevices: async function() { return [this.device]; },
    ...overrides,
  };
  return transport;
}

test("JLinkWebUsbBackend: requestDevice delegates to transport", async () => {
  const transport = makeFakeTransport();
  const backend = Object.create(JLinkWebUsbBackend.prototype);
  backend.transport = transport;
  backend.client = null;
  backend.flasher = null;
  const dev = await backend.requestDevice();
  assert.equal(dev.productName, "J-Link");
});

test("JLinkWebUsbBackend: getAuthorizedDevices delegates to transport", async () => {
  const transport = makeFakeTransport();
  const backend = Object.create(JLinkWebUsbBackend.prototype);
  backend.transport = transport;
  backend.client = null;
  backend.flasher = null;
  const devs = await backend.getAuthorizedDevices();
  assert.equal(devs.length, 1);
});

test("JLinkWebUsbBackend: connect calls client.connect", async () => {
  const transport = makeFakeTransport();
  let connected = false;
  const client = { connect: async () => { connected = true; }, disconnect: async () => {}, getProbeInfo: async () => ({}), ping: async () => ({}) };
  const backend = Object.create(JLinkWebUsbBackend.prototype);
  backend.transport = transport;
  backend.client = client;
  backend.flasher = { programImage: async () => {}, verifyImage: async () => {}, reset: async () => {} };
  await backend.connect();
  assert.equal(connected, true);
});

test("JLinkWebUsbBackend: disconnect calls client.disconnect", async () => {
  let disconnected = false;
  const client = { connect: async () => {}, disconnect: async () => { disconnected = true; }, getProbeInfo: async () => ({}), ping: async () => ({}) };
  const backend = Object.create(JLinkWebUsbBackend.prototype);
  backend.transport = null;
  backend.client = client;
  backend.flasher = { programImage: async () => {}, verifyImage: async () => {}, reset: async () => {} };
  await backend.disconnect();
  assert.equal(disconnected, true);
});

test("JLinkWebUsbBackend: getProbeInfo returns probe metadata", async () => {
  const client = { getProbeInfo: async () => ({ backend: "jlink-webusb", name: "J-Link", manufacturer: "SEGGER", transport: "webusb-bulk" }) };
  const backend = Object.create(JLinkWebUsbBackend.prototype);
  backend.transport = null;
  backend.client = client;
  backend.flasher = null;
  const info = await backend.getProbeInfo();
  assert.equal(info.name, "J-Link");
  assert.equal(info.manufacturer, "SEGGER");
  assert.equal(info.backend, "jlink-webusb");
});

test("JLinkWebUsbBackend: getTargetInfo returns unresolved placeholder", async () => {
  const backend = Object.create(JLinkWebUsbBackend.prototype);
  backend.transport = null;
  backend.client = null;
  backend.flasher = null;
  const info = await backend.getTargetInfo();
  assert.equal(info.family, "unknown");
  assert.equal(info.part, "unresolved");
});

test("JLinkWebUsbBackend: readMemory throws not implemented", async () => {
  const backend = Object.create(JLinkWebUsbBackend.prototype);
  backend.transport = null;
  backend.client = null;
  backend.flasher = null;
  await assert.rejects(() => backend.readMemory(0, 16), /not implemented/);
});

test("JLinkWebUsbBackend: capabilities returns supportsFlash true, supportsReadMemory false", () => {
  const backend = Object.create(JLinkWebUsbBackend.prototype);
  backend.transport = null;
  backend.client = null;
  backend.flasher = null;
  const caps = backend.capabilities();
  assert.equal(caps.supportsFlash, true);
  assert.equal(caps.supportsReadMemory, false);
  assert.equal(caps.supportsReset, true);
});

test("JLinkWebUsbBackend: programImage delegates to flasher", async () => {
  let called = false;
  const flasher = { programImage: async (img) => { called = true; return { ok: true }; } };
  const backend = Object.create(JLinkWebUsbBackend.prototype);
  backend.transport = null;
  backend.client = null;
  backend.flasher = flasher;
  await backend.programImage({ byteCount: 1024 });
  assert.equal(called, true);
});

test("JLinkWebUsbBackend: verifyImage delegates to flasher", async () => {
  let called = false;
  const flasher = { verifyImage: async () => { called = true; } };
  const backend = Object.create(JLinkWebUsbBackend.prototype);
  backend.transport = null;
  backend.client = null;
  backend.flasher = flasher;
  await backend.verifyImage();
  assert.equal(called, true);
});

test("JLinkWebUsbBackend: reset delegates to flasher with mode", async () => {
  let received = null;
  const flasher = { reset: async (mode) => { received = mode; } };
  const backend = Object.create(JLinkWebUsbBackend.prototype);
  backend.transport = null;
  backend.client = null;
  backend.flasher = flasher;
  await backend.reset("halt");
  assert.equal(received, "halt");
});

test("JLinkWebUsbClient: connect opens transport", async () => {
  let opened = false;
  const transport = { open: async () => { opened = true; } };
  const client = new JLinkWebUsbClient(transport);
  await client.connect();
  assert.equal(opened, true);
});

test("JLinkWebUsbClient: disconnect closes transport", async () => {
  let closed = false;
  const transport = { close: async () => { closed = true; } };
  const client = new JLinkWebUsbClient(transport);
  await client.disconnect();
  assert.equal(closed, true);
});

test("JLinkWebUsbClient: getProbeInfo returns probe metadata", async () => {
  const transport = {
    device: { productName: "My J-Link", manufacturerName: "Acme", vendorId: 0x1366, productId: 0x0101 },
  };
  const client = new JLinkWebUsbClient(transport);
  const info = await client.getProbeInfo();
  assert.equal(info.name, "My J-Link");
  assert.equal(info.manufacturer, "Acme");
  assert.equal(info.vendorId, 0x1366);
  assert.equal(info.productId, 0x0101);
  assert.equal(info.transport, "webusb-bulk");
});

test("JLinkWebUsbClient: ping returns ok", async () => {
  const client = new JLinkWebUsbClient({});
  const result = await client.ping();
  assert.equal(result.ok, true);
});

test("JLinkWebUsbFlasher: programImage emits prepare and staged progress", async () => {
  const bus = new EventBus();
  const events = [];
  bus.on(Topics.FLASH_PROGRESS, (e) => events.push(e));
  const client = { ping: async () => {} };
  const flasher = new JLinkWebUsbFlasher(client, bus);
  await flasher.programImage({ byteCount: 1024 });
  assert.equal(events.length, 2);
  assert.equal(events[0].kind, "program");
  assert.equal(events[0].percent, 5);
  assert.equal(events[1].percent, 100);
  assert.ok(events[1].message.includes("1024"));
});

test("JLinkWebUsbFlasher: verifyImage emits verify progress", async () => {
  const bus = new EventBus();
  const events = [];
  bus.on(Topics.FLASH_PROGRESS, (e) => events.push(e));
  const flasher = new JLinkWebUsbFlasher({ ping: async () => {} }, bus);
  await flasher.verifyImage();
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "verify");
  assert.equal(events[0].percent, 100);
});

test("JLinkWebUsbFlasher: reset emits mode-specific progress", async () => {
  const bus = new EventBus();
  const events = [];
  bus.on(Topics.FLASH_PROGRESS, (e) => events.push(e));
  const flasher = new JLinkWebUsbFlasher({ ping: async () => {} }, bus);
  await flasher.reset("halt");
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "reset");
  assert.ok(events[0].message.includes("halt"));
});
