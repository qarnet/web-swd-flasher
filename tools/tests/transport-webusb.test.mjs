import test from "node:test";
import assert from "node:assert/strict";
import { CmsisDapWebUsbTransport } from "../../src/backends/cmsis-dap/transport-webusb.js";

function makeFakeDevice(opts = {}) {
  return {
    vendorId: opts.vendorId || 0x0d28,
    productId: opts.productId || 0x0204,
    productName: opts.productName || "Fake Probe",
    opened: false,
    configuration: opts.config !== undefined ? opts.config : {
      configurationValue: 1,
      interfaces: [
        {
          interfaceNumber: 0,
          alternates: [
            {
              alternateSetting: 0,
              interfaceClass: 0xff,
              endpoints: [
                { direction: "in", type: "bulk", endpointNumber: 0x81, packetSize: 64 },
                { direction: "out", type: "bulk", endpointNumber: 0x02, packetSize: 64 },
              ]
            }
          ]
        }
      ]
    },
    _opened: false,
    _closed: false,
    _claimed: null,
    _released: null,
    _transfersIn: [],
    _transfersOut: [],
    open: async function() { this._opened = true; this.opened = true; },
    close: async function() { this._closed = true; this.opened = false; },
    selectConfiguration: async function(n) { this._selectedConfig = n; },
    claimInterface: async function(n) { this._claimed = n; },
    releaseInterface: async function(n) { this._released = n; },
    transferIn: async function(ep, len) { this._transfersIn.push({ ep, len }); return { data: new Uint8Array(8), status: "ok" }; },
    transferOut: async function(ep, data) { this._transfersOut.push({ ep, data }); return { status: "ok" }; },
  };
}

function setupUsbNav(devices = [], opts = {}) {
  const requestOpts = { _opts: null };
  const nav = {
    _devices: devices,
    getDevices: async () => devices,
    requestDevice: async function(o) { this._opts = o; return devices[0]; },
  };
  Object.defineProperty(globalThis, "navigator", { value: { usb: nav }, configurable: true, writable: true });
  return nav;
}

test("CmsisDapWebUsbTransport: constructor stores logger and defaults", () => {
  setupUsbNav();
  const t = new CmsisDapWebUsbTransport(null);
  assert.equal(t.device, null);
  assert.equal(t.interfaceNumber, null);
  assert.equal(t.endpointIn, null);
  assert.equal(t.endpointOut, null);
  assert.equal(t.packetSize, 64);
  assert.equal(t.log, null);
});

test("CmsisDapWebUsbTransport: constructor accepts logger", () => {
  setupUsbNav();
  const log = (msg) => {};
  const t = new CmsisDapWebUsbTransport(log);
  assert.equal(t.log, log);
});

test("CmsisDapWebUsbTransport: withQuiet suppresses and restores logger", async () => {
  setupUsbNav();
  const log = () => {};
  const t = new CmsisDapWebUsbTransport(log);
  let result = null;
  await t.withQuiet(async () => {
    assert.equal(t.log, null);
    result = 42;
    return result;
  });
  assert.equal(result, 42);
  assert.equal(t.log, log);
});

test("CmsisDapWebUsbTransport: debug logs through logger", () => {
  setupUsbNav();
  const calls = [];
  const t = new CmsisDapWebUsbTransport((msg) => calls.push(msg));
  t.debug("hello", { foo: 1 });
  assert.ok(calls[0].includes("hello"));
  assert.ok(calls[0].includes("foo"));
});

test("CmsisDapWebUsbTransport: debug is no-op when logger is null", () => {
  setupUsbNav();
  const t = new CmsisDapWebUsbTransport(null);
  assert.doesNotThrow(() => t.debug("hello"));
});

test("CmsisDapWebUsbTransport: requestDevice returns existing authorized device", async () => {
  const dev = makeFakeDevice();
  setupUsbNav([dev]);
  const t = new CmsisDapWebUsbTransport();
  const result = await t.requestDevice();
  assert.equal(result, dev);
  assert.equal(t.device, dev);
});

test("CmsisDapWebUsbTransport: requestDevice calls navigator.usb.requestDevice when no cached", async () => {
  const dev = makeFakeDevice();
  const nav = setupUsbNav();
  Object.defineProperty(globalThis, "navigator", { value: { usb: { getDevices: async () => [], requestDevice: async (o) => { nav._opts = o; return dev; } } }, configurable: true, writable: true });
  const t = new CmsisDapWebUsbTransport();
  const result = await t.requestDevice();
  assert.equal(result, dev);
});

test("CmsisDapWebUsbTransport: getAuthorizedDevices returns navigator.usb.getDevices()", async () => {
  const dev = makeFakeDevice();
  setupUsbNav([dev]);
  const t = new CmsisDapWebUsbTransport();
  const result = await t.getAuthorizedDevices();
  assert.equal(result[0], dev);
});

test("CmsisDapWebUsbTransport: useDevice stores and returns device", () => {
  setupUsbNav();
  const dev = makeFakeDevice();
  const t = new CmsisDapWebUsbTransport();
  const result = t.useDevice(dev);
  assert.equal(result, dev);
  assert.equal(t.device, dev);
});

test("CmsisDapWebUsbTransport: open throws when no device", async () => {
  setupUsbNav();
  const t = new CmsisDapWebUsbTransport();
  await assert.rejects(() => t.open(), /No CMSIS-DAP device/);
});

test("CmsisDapWebUsbTransport: open calls device.open and claimInterface", async () => {
  const dev = makeFakeDevice();
  setupUsbNav();
  const t = new CmsisDapWebUsbTransport();
  t.useDevice(dev);
  await t.open();
  assert.equal(dev._opened, true);
  assert.equal(dev._claimed, 0);
  assert.equal(t.interfaceNumber, 0);
  assert.equal(t.endpointIn, 0x81);
  assert.equal(t.endpointOut, 0x02);
});

test("CmsisDapWebUsbTransport: open throws when no bulk interface", async () => {
  const dev = makeFakeDevice({ config: { interfaces: [{ interfaceNumber: 0, alternates: [{ endpoints: [{ type: "interrupt" }] }] }] } });
  setupUsbNav();
  const t = new CmsisDapWebUsbTransport();
  t.useDevice(dev);
  await assert.rejects(() => t.open(), /No bulk CMSIS-DAP interface/);
});

test("CmsisDapWebUsbTransport: open calls diagnoseClaimFailures on claim failure", async () => {
  const dev = makeFakeDevice();
  dev.claimInterface = async () => { throw new Error("claim fail"); };
  const t = new CmsisDapWebUsbTransport();
  t.useDevice(dev);
  let diagnosed = false;
  t.diagnoseClaimFailures = async () => { diagnosed = true; };
  await assert.rejects(() => t.open(), /claim fail/);
  assert.equal(diagnosed, true);
});

test("CmsisDapWebUsbTransport: write throws when not open", async () => {
  setupUsbNav();
  const t = new CmsisDapWebUsbTransport();
  await assert.rejects(() => t.write(new Uint8Array([1])), /not open/);
});

test("CmsisDapWebUsbTransport: write calls transferOut", async () => {
  const dev = makeFakeDevice();
  setupUsbNav();
  const t = new CmsisDapWebUsbTransport();
  t.useDevice(dev);
  await t.open();
  await t.write(new Uint8Array([0x01, 0x02]));
  assert.equal(dev._transfersOut.length, 1);
  assert.equal(dev._transfersOut[0].ep, 0x02);
});

test("CmsisDapWebUsbTransport: read throws when not open", async () => {
  setupUsbNav();
  const t = new CmsisDapWebUsbTransport();
  await assert.rejects(() => t.read(), /not open/);
});

test("CmsisDapWebUsbTransport: read calls transferIn and returns data", async () => {
  const dev = makeFakeDevice();
  dev.transferIn = async () => ({ data: new Uint8Array([0x05, 0x06, 0x07]), status: "ok" });
  setupUsbNav();
  const t = new CmsisDapWebUsbTransport();
  t.useDevice(dev);
  await t.open();
  const data = await t.read();
  assert.equal(data.length, 3);
  assert.equal(data[0], 0x05);
});

test("CmsisDapWebUsbTransport: close is safe when no device", async () => {
  setupUsbNav();
  const t = new CmsisDapWebUsbTransport();
  await assert.doesNotReject(() => t.close());
});

test("CmsisDapWebUsbTransport: close releases interface and closes device", async () => {
  const dev = makeFakeDevice();
  setupUsbNav();
  const t = new CmsisDapWebUsbTransport();
  t.useDevice(dev);
  await t.open();
  await t.close();
  assert.equal(dev._released, 0);
  assert.equal(dev._closed, true);
  assert.equal(t.interfaceNumber, null);
});

test("CmsisDapWebUsbTransport: close swallows releaseInterface errors", async () => {
  const dev = makeFakeDevice();
  dev.releaseInterface = async () => { throw new Error("release fail"); };
  setupUsbNav();
  const t = new CmsisDapWebUsbTransport();
  t.useDevice(dev);
  await t.open();
  await assert.doesNotReject(() => t.close());
});
