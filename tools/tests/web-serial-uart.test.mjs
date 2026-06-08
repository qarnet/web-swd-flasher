import test from "node:test";
import assert from "node:assert/strict";
import { WebSerialUart } from "../../src/backends/serial/web-serial-uart.js";

function makeFakePort(info = { usbVendorId: 0x1234 }) {
  let readableStream;
  let writableStream;
  const port = {
    _opened: false,
    _closed: false,
    _opts: null,
    _readers: [],
    _writers: [],
    _readerDone: false,
    _pendingValues: [],
    _readResolvers: [],
    getInfo: () => info,
    open: async function(opts) {
      this._opened = true;
      this._opts = opts;
      if (!readableStream) {
        readableStream = new ReadableStream({
          start: (ctrl) => {
            this._readController = ctrl;
          },
        });
      }
      if (!writableStream) {
        writableStream = new WritableStream({
          write: (chunk) => {
            this._writers.push(new Uint8Array(chunk));
          },
        });
      }
    },
    close: async function() { this._closed = true; },
    get readable() { return readableStream; },
    get writable() { return writableStream; },
  };
  return port;
}

function setupSerialNav(ports = []) {
  const portList = ports;
  const nav = {
    _requested: null,
    requestPort: async function(opts) {
      this._requested = opts;
      const port = makeFakePort();
      portList.push(port);
      return port;
    },
    getPorts: async () => portList,
  };
  Object.defineProperty(globalThis, "navigator", { value: { serial: nav }, configurable: true, writable: true });
  return nav;
}

test("WebSerialUart: constructor initializes all state to null/false", async () => {
  setupSerialNav();
  const uart = new WebSerialUart();
  assert.equal(uart._port, null);
  assert.equal(uart._reader, null);
  assert.equal(uart._writer, null);
  assert.equal(uart._readableClosed, null);
  assert.equal(uart._writableClosed, null);
  assert.equal(uart._onData, null);
  assert.equal(uart._reading, false);
  assert.equal(uart._connected, false);
});

test("WebSerialUart: supported returns boolean from navigator.serial", async () => {
  setupSerialNav();
  assert.equal(WebSerialUart.supported, true);
});

test("WebSerialUart: supported false when navigator.serial missing", async () => {
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true, writable: true });
  assert.equal(WebSerialUart.supported, false);
});

test("WebSerialUart: requestPort calls navigator.serial.requestPort with filters", async () => {
  const portList = [];
  const nav = setupSerialNav(portList);
  const uart = new WebSerialUart();
  const info = await uart.requestPort([{ usbVendorId: 0x1234 }]);
  assert.equal(nav._requested.filters[0].usbVendorId, 0x1234);
  assert.equal(info.usbVendorId, 0x1234);
  assert.equal(uart._port, portList[0]);
});

test("WebSerialUart: requestPort without filters passes empty options", async () => {
  const portList = [];
  const nav = setupSerialNav(portList);
  const uart = new WebSerialUart();
  await uart.requestPort();
  assert.deepEqual(nav._requested, {});
});

test("WebSerialUart: getAuthorizedPorts returns mapped getInfo results", async () => {
  const portList = [makeFakePort(), makeFakePort({ usbVendorId: 0x5678 })];
  setupSerialNav(portList);
  const uart = new WebSerialUart();
  const infos = await uart.getAuthorizedPorts();
  assert.equal(infos.length, 2);
  assert.equal(infos[1].usbVendorId, 0x5678);
});

test("WebSerialUart: useAuthorizedPort returns first port info, stores port", async () => {
  const portList = [makeFakePort()];
  setupSerialNav(portList);
  const uart = new WebSerialUart();
  const info = await uart.useAuthorizedPort();
  assert.equal(info.usbVendorId, 0x1234);
  assert.equal(uart._port, portList[0]);
});

test("WebSerialUart: useAuthorizedPort returns null when no ports", async () => {
  setupSerialNav([]);
  const uart = new WebSerialUart();
  const info = await uart.useAuthorizedPort();
  assert.equal(info, null);
  assert.equal(uart._port, null);
});

test("WebSerialUart: open throws when no port selected", async () => {
  setupSerialNav();
  const uart = new WebSerialUart();
  await assert.rejects(() => uart.open(), /No serial port selected/);
});

test("WebSerialUart: open calls port.open with full config", async () => {
  const portList = [];
  setupSerialNav(portList);
  const uart = new WebSerialUart();
  await uart.requestPort();
  await uart.open({ baudRate: 9600, dataBits: 7, stopBits: 2, parity: "even", flowControl: "hardware" });
  assert.equal(portList[0]._opened, true);
  assert.equal(portList[0]._opts.baudRate, 9600);
  assert.equal(portList[0]._opts.dataBits, 7);
  assert.equal(portList[0]._opts.stopBits, 2);
  assert.equal(portList[0]._opts.parity, "even");
  assert.equal(portList[0]._opts.flowControl, "hardware");
});

test("WebSerialUart: open sets _connected=true and stores onData", async () => {
  const portList = [];
  setupSerialNav(portList);
  const uart = new WebSerialUart();
  await uart.requestPort();
  const onData = () => {};
  await uart.open({ onData });
  assert.equal(uart.connected, true);
  assert.equal(uart._onData, onData);
});

test("WebSerialUart: send throws when port not open", async () => {
  setupSerialNav();
  const uart = new WebSerialUart();
  await assert.rejects(() => uart.send(new Uint8Array([1])), /Serial port not open/);
});

test("WebSerialUart: send writes bytes to port", async () => {
  const portList = [];
  setupSerialNav(portList);
  const uart = new WebSerialUart();
  await uart.requestPort();
  await uart.open();
  const bytes = new Uint8Array([0x41, 0x42, 0x43]);
  await uart.send(bytes);
  await new Promise(r => setTimeout(r, 5));
  assert.equal(portList[0]._writers.length, 1);
  assert.deepEqual(portList[0]._writers[0], bytes);
});

test("WebSerialUart: connected getter returns _connected", async () => {
  setupSerialNav();
  const uart = new WebSerialUart();
  assert.equal(uart.connected, false);
});

test("WebSerialUart: info getter returns null when no port", async () => {
  setupSerialNav();
  const uart = new WebSerialUart();
  assert.equal(uart.info, null);
});

test("WebSerialUart: info getter returns port.getInfo()", async () => {
  const portList = [];
  setupSerialNav(portList);
  const uart = new WebSerialUart();
  await uart.requestPort();
  assert.equal(uart.info.usbVendorId, 0x1234);
});

test("WebSerialUart: close sets _connected=false and clears onData", async () => {
  const portList = [];
  setupSerialNav(portList);
  const uart = new WebSerialUart();
  await uart.requestPort();
  await uart.open({ onData: () => {} });
  assert.equal(uart.connected, true);
  await uart.close();
  assert.equal(uart.connected, false);
  assert.equal(uart._onData, null);
  assert.equal(portList[0]._closed, true);
});

test("WebSerialUart: close is safe when not connected", async () => {
  setupSerialNav();
  const uart = new WebSerialUart();
  await assert.doesNotReject(() => uart.close());
});
