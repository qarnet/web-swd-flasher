import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { SerialManager } from "../../src/core/serial-manager.js";
import { EventBus } from "../../src/core/event-bus.js";
import { Topics } from "../../src/core/event-bus-topics.js";

function makeFakePort(info = { usbVendorId: 0x1234 }) {
  let readableStream;
  const port = {
    _opened: false,
    _closed: false,
    _opts: null,
    _writers: [],
    _controller: null,
    _pendingRead: null,
    _readDone: false,
    getInfo: () => info,
    get readable() {
      if (!readableStream) {
        readableStream = new ReadableStream({
          start: (ctrl) => {
            this._controller = ctrl;
            ctrl.enqueue = (chunk) => {
              this._pendingRead = Promise.resolve({ value: chunk, done: false });
            };
          },
        });
      }
      return readableStream;
    },
    get writable() {
      return new WritableStream({
        write: (chunk) => {
          this._writers.push(new Uint8Array(chunk));
        },
      });
    },
    open: async function(opts) {
      this._opened = true;
      this._opts = opts;
    },
    close: async function() { this._closed = true; },
  };
  return port;
}

function setupSerialEnv(ports = []) {
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

test("serial-manager: SerialManager.supported reflects navigator.serial presence", () => {
  makeDom("");
  setupSerialEnv();
  assert.equal(SerialManager.supported, true);
});

test("serial-manager: SerialManager.supported false when navigator.serial missing", () => {
  makeDom("");
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true, writable: true });
  assert.equal(SerialManager.supported, false);
});

test("serial-manager: requestPort creates WebSerialUart and returns portInfo", async () => {
  makeDom("");
  const portList = [];
  setupSerialEnv(portList);
  const bus = new EventBus();
  const mgr = new SerialManager(bus);
  const info = await mgr.requestPort();
  assert.ok(info);
  assert.equal(mgr.portInfo, info);
  assert.ok(mgr._uart);
});

test("serial-manager: requestPort passes filters to navigator.serial", async () => {
  makeDom("");
  const portList = [];
  const nav = setupSerialEnv(portList);
  const bus = new EventBus();
  const mgr = new SerialManager(bus);
  const filters = [{ usbVendorId: 0x1234 }];
  await mgr.requestPort(filters);
  assert.equal(nav._requested.filters, filters);
});

test("serial-manager: getAuthorizedPorts returns list of port infos", async () => {
  makeDom("");
  const portList = [];
  setupSerialEnv(portList);
  const bus = new EventBus();
  const mgr = new SerialManager(bus);
  const ports = await mgr.getAuthorizedPorts();
  assert.equal(ports.length, 0);
});

test("serial-manager: useAuthorizedPort lazily creates _uart when no existing", async () => {
  makeDom("");
  const portList = [];
  setupSerialEnv(portList);
  const bus = new EventBus();
  const mgr = new SerialManager(bus);
  assert.equal(mgr._uart, null);
  await mgr.useAuthorizedPort();
  assert.notEqual(mgr._uart, null);
});

test("serial-manager: useAuthorizedPort reuses existing _uart", async () => {
  makeDom("");
  const portList = [];
  setupSerialEnv(portList);
  const bus = new EventBus();
  const mgr = new SerialManager(bus);
  await mgr.requestPort();
  const uart = mgr._uart;
  await mgr.useAuthorizedPort();
  assert.equal(mgr._uart, uart);
});

test("serial-manager: connect throws if no port selected", async () => {
  makeDom("");
  setupSerialEnv();
  const bus = new EventBus();
  const mgr = new SerialManager(bus);
  await assert.rejects(() => mgr.connect(), /No serial port/);
});

test("serial-manager: connect opens UART with default config", async () => {
  makeDom("");
  const portList = [];
  setupSerialEnv(portList);
  const bus = new EventBus();
  const mgr = new SerialManager(bus);
  await mgr.requestPort();
  await mgr.connect();
  assert.equal(portList[0]._opened, true);
  assert.equal(portList[0]._opts.baudRate, 115200);
  assert.equal(portList[0]._opts.dataBits, 8);
  assert.equal(portList[0]._opts.stopBits, 1);
  assert.equal(portList[0]._opts.parity, "none");
  assert.equal(portList[0]._opts.flowControl, "none");
});

test("serial-manager: connect opens UART with custom config", async () => {
  makeDom("");
  const portList = [];
  setupSerialEnv(portList);
  const bus = new EventBus();
  const mgr = new SerialManager(bus);
  await mgr.requestPort();
  await mgr.connect({ baudRate: 9600, dataBits: 7, stopBits: 2, parity: "even", flowControl: "hardware" });
  assert.equal(portList[0]._opts.baudRate, 9600);
  assert.equal(portList[0]._opts.dataBits, 7);
  assert.equal(portList[0]._opts.stopBits, 2);
  assert.equal(portList[0]._opts.parity, "even");
  assert.equal(portList[0]._opts.flowControl, "hardware");
});

test("serial-manager: connect stores baudRate", async () => {
  makeDom("");
  const portList = [];
  setupSerialEnv(portList);
  const bus = new EventBus();
  const mgr = new SerialManager(bus);
  await mgr.requestPort();
  await mgr.connect({ baudRate: 57600 });
  assert.equal(mgr.baudRate, 57600);
});

test("serial-manager: connect sets _connected = true", async () => {
  makeDom("");
  const portList = [];
  setupSerialEnv(portList);
  const bus = new EventBus();
  const mgr = new SerialManager(bus);
  await mgr.requestPort();
  await mgr.connect();
  assert.equal(mgr.connected, true);
});

test("serial-manager: connect onData callback emits SERIAL_DATA topic", async () => {
  makeDom("");
  const portList = [];
  setupSerialEnv(portList);
  const bus = new EventBus();
  const mgr = new SerialManager(bus);
  await mgr.requestPort();
  let received = null;
  bus.on(Topics.SERIAL_DATA, (data) => { received = data; });
  await mgr.connect();
  const testBytes = new Uint8Array([0x41, 0x42]);
  mgr._uart._onData(testBytes);
  assert.ok(received);
  assert.deepEqual(received.bytes, testBytes);
});

test("serial-manager: disconnect sets _connected = false", async () => {
  makeDom("");
  const portList = [];
  setupSerialEnv(portList);
  const bus = new EventBus();
  const mgr = new SerialManager(bus);
  await mgr.requestPort();
  await mgr.connect();
  assert.equal(mgr.connected, true);
  await mgr.disconnect();
  assert.equal(mgr.connected, false);
});

test("serial-manager: disconnect is safe when _uart is null", async () => {
  makeDom("");
  setupSerialEnv();
  const bus = new EventBus();
  const mgr = new SerialManager(bus);
  await mgr.disconnect();
  assert.equal(mgr.connected, false);
});

test("serial-manager: send throws if no port", async () => {
  makeDom("");
  setupSerialEnv();
  const bus = new EventBus();
  const mgr = new SerialManager(bus);
  await assert.rejects(() => mgr.send(new Uint8Array([1, 2])), /No serial port/);
});

test("serial-manager: send writes bytes to port", async () => {
  makeDom("");
  const portList = [];
  setupSerialEnv(portList);
  const bus = new EventBus();
  const mgr = new SerialManager(bus);
  await mgr.requestPort();
  await mgr.connect();
  const bytes = new Uint8Array([0x41, 0x42, 0x43]);
  await mgr.send(bytes);
  await new Promise(r => setTimeout(r, 10));
  assert.equal(portList[0]._writers.length, 1);
  assert.deepEqual(portList[0]._writers[0], bytes);
});

test("serial-manager: connected getter returns _connected state", async () => {
  makeDom("");
  const portList = [];
  setupSerialEnv(portList);
  const bus = new EventBus();
  const mgr = new SerialManager(bus);
  assert.equal(mgr.connected, false);
  await mgr.requestPort();
  await mgr.connect();
  assert.equal(mgr.connected, true);
});

test("serial-manager: portInfo getter returns _portInfo", async () => {
  makeDom("");
  const portList = [];
  setupSerialEnv(portList);
  const bus = new EventBus();
  const mgr = new SerialManager(bus);
  assert.equal(mgr.portInfo, null);
  await mgr.requestPort();
  assert.ok(mgr.portInfo);
});

test("serial-manager: baudRate getter returns _baudRate", () => {
  makeDom("");
  setupSerialEnv();
  const bus = new EventBus();
  const mgr = new SerialManager(bus);
  assert.equal(mgr.baudRate, 115200);
  mgr._baudRate = 9600;
  assert.equal(mgr.baudRate, 9600);
});
