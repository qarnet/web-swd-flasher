import { parseHTML } from "linkedom";

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
  Object.defineProperty(globalThis, "navigator", { value: undefined, configurable: true });
}
