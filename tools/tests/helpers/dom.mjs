import { parseHTML } from "linkedom";

let _testStore = {};
export function setupStore() {
  _testStore = {};
  globalThis.localStorage = {
    getItem(k) { return _testStore[k] ?? null; },
    setItem(k, v) { _testStore[k] = v; },
    removeItem(k) { delete _testStore[k]; },
  };
}
export function makeDomAndStore(html) {
  makeDom(html);
  globalThis.localStorage = {
    getItem(k) { return _testStore[k] ?? null; },
    setItem(k, v) { _testStore[k] = v; },
    removeItem(k) { delete _testStore[k]; },
  };
}
export function getStoreValue(key) { return _testStore[key]; }
export function seedStore(key, value) { _testStore[key] = value; }
export function attachControls(session) {
  const container = session.buildControls();
  document.getElementById("root").appendChild(container);
}

export function makeDom(html) {
  const { window, document: doc } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  window.confirm = () => true;
  window.localStorage = { _store: {}, getItem(k) { return this._store[k] ?? null; }, setItem(k, v) { this._store[k] = v; } };
  window.navigator.serial = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  window.navigator.usb = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getDevices: async () => [],
  };
  globalThis.window = window;
  globalThis.document = doc;
  globalThis.location = { protocol: "https:", hostname: "localhost" };
  globalThis.localStorage = window.localStorage;
  globalThis.MutationObserver = window.MutationObserver || class { constructor() {} observe() {} disconnect() {} };
  globalThis.ResizeObserver = class { constructor(cb) { this._cb = cb; } observe(target) { this._target = target; } unobserve() {} disconnect() {} trigger() { try { this._cb([{ target: this._target, contentRect: { width: 800, height: 600 } }]); } catch {} } };
  globalThis.Blob = class Blob {};
  globalThis.URL = { createObjectURL: () => "blob:fake", revokeObjectURL: () => {} };
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
  return window;
}

export function teardownDom() {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.location;
  delete globalThis.localStorage;
  delete globalThis.Blob;
  delete globalThis.URL;
  delete globalThis.ResizeObserver;
  Object.defineProperty(globalThis, "navigator", { value: undefined, configurable: true });
  _testStore = {};
}
