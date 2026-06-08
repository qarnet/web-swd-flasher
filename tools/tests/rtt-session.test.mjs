import test from "node:test";
import assert from "node:assert/strict";
import { setupStore, makeDomAndStore, attachControls, getStoreValue } from "./helpers/dom.mjs";
import { RttSession } from "../../src/ui/terminals/rtt-session.js";
import { EventBus } from "../../src/core/event-bus.js";
import { Topics } from "../../src/core/event-bus-topics.js";

function makeFakeRttClient(opts = {}) {
  return {
    _dataListeners: [],
    _errorListeners: [],
    controlBlockAddr: opts.controlBlockAddr || 0x20000000,
    upChannelCount: opts.upChannelCount !== undefined ? opts.upChannelCount : 1,
    downChannelCount: opts.downChannelCount !== undefined ? opts.downChannelCount : 1,
    _polling: false,
    _stopped: false,
    search: async (start, size) => {
      if (opts.searchThrows) throw new Error("search failed");
      return opts.searchResult !== undefined ? opts.searchResult : true;
    },
    startPolling: function(ms) { this._polling = true; this._interval = ms; },
    stop: function() { this._polling = false; this._stopped = true; },
    write: async (channel, bytes) => { opts.writeCalls?.push({ channel, bytes }); },
    removeAllListeners: function() { this._dataListeners = []; this._errorListeners = []; return this; },
    on: function(event, cb) {
      if (event === "data") this._dataListeners.push(cb);
      if (event === "error") this._errorListeners.push(cb);
      return this;
    },
  };
}

test("RttSession: channelId returns 'rtt'", () => {
  const s = new RttSession({ backendProvider: () => null });
  assert.equal(s.channelId, "rtt");
});

test("RttSession: isReady() returns false when _rttClient is null", () => {
  const s = new RttSession({ backendProvider: () => null });
  assert.equal(s.isReady(), false);
});

test("RttSession: isReady() returns false when _rttClient.downChannelCount === 0", () => {
  const s = new RttSession({ backendProvider: () => null });
  s._rttClient = makeFakeRttClient({ downChannelCount: 0 });
  assert.equal(s.isReady(), false);
});

test("RttSession: isReady() returns true when _rttClient exists and downChannelCount > 0", () => {
  const s = new RttSession({ backendProvider: () => null });
  s._rttClient = makeFakeRttClient({ downChannelCount: 1 });
  assert.equal(s.isReady(), true);
});

test("RttSession: sendRaw throws when _rttClient is null", async () => {
  const s = new RttSession({ backendProvider: () => null });
  await assert.rejects(() => s.sendRaw(new Uint8Array([1, 2])), /RTT not connected/);
});

test("RttSession: sendRaw calls _rttClient.write(0, bytes)", async () => {
  const s = new RttSession({ backendProvider: () => null });
  const writeCalls = [];
  s._rttClient = makeFakeRttClient({ writeCalls });
  const bytes = new Uint8Array([0x41, 0x42]);
  await s.sendRaw(bytes);
  assert.equal(writeCalls.length, 1);
  assert.equal(writeCalls[0].channel, 0);
  assert.deepEqual(writeCalls[0].bytes, bytes);
});

test("RttSession: buildControls creates RAM start input with default 0x20000000", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const s = new RttSession({ backendProvider: () => null });
  const container = s.buildControls();
  const input = container.querySelector(".rtt-ram-start");
  assert.ok(input);
});

test("RttSession: buildControls creates RAM size input with default 256", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const s = new RttSession({ backendProvider: () => null });
  const container = s.buildControls();
  const input = container.querySelector(".rtt-ram-size");
  assert.ok(input);
  assert.equal(input.value, "256");
});

test("RttSession: buildControls creates poll interval input with default 50", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const s = new RttSession({ backendProvider: () => null });
  const container = s.buildControls();
  const input = container.querySelector(".rtt-interval");
  assert.ok(input);
  assert.equal(input.value, "50");
  assert.equal(input.getAttribute("min"), "10");
  assert.equal(input.getAttribute("max"), "500");
});

test("RttSession: buildControls creates Search/Start/Stop buttons all disabled", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const s = new RttSession({ backendProvider: () => null });
  const container = s.buildControls();
  const search = container.querySelector(".btn-rtt-search");
  const start = container.querySelector(".btn-rtt-start");
  const stop = container.querySelector(".btn-rtt-stop");
  assert.ok(search);
  assert.ok(start);
  assert.ok(stop);
  assert.equal(search.disabled, true);
  assert.equal(start.disabled, true);
  assert.equal(stop.disabled, true);
});

test("RttSession: buildControls has status paragraph", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const s = new RttSession({ backendProvider: () => null });
  const container = s.buildControls();
  const status = container.querySelector(".rtt-status");
  assert.ok(status);
});

test("RttSession: buildControls persists inputs via persistInput", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const s = new RttSession({ backendProvider: () => null });
  attachControls(s);
  const ramStart = globalThis.document.querySelector(".rtt-ram-start");
  ramStart.value = "0x20010000";
  ramStart.dispatchEvent(new globalThis.window.Event("change", { bubbles: true }));
  assert.equal(getStoreValue("rtt-ram-start"), "0x20010000");
});

test("RttSession: _parseHexInput parses 0x prefix", () => {
  const s = new RttSession({ backendProvider: () => null });
  assert.equal(s._parseHexInput("0x20000000"), 0x20000000);
  assert.equal(s._parseHexInput("0XFF"), 255);
  assert.equal(s._parseHexInput("0x10"), 16);
});

test("RttSession: _parseHexInput parses decimal without prefix", () => {
  const s = new RttSession({ backendProvider: () => null });
  assert.equal(s._parseHexInput("256"), 256);
  assert.equal(s._parseHexInput("0"), 0);
  assert.equal(s._parseHexInput("100"), 100);
});

test("RttSession: _parseHexInput trims whitespace", () => {
  const s = new RttSession({ backendProvider: () => null });
  assert.equal(s._parseHexInput("  0x100  "), 256);
});

test("RttSession: _parseHexInput returns NaN for invalid input", () => {
  const s = new RttSession({ backendProvider: () => null });
  assert.ok(isNaN(s._parseHexInput("xyz")));
  assert.ok(isNaN(s._parseHexInput("")));
});

test("RttSession: init BACKEND_CONNECTED enables Search button", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const s = new RttSession({ backendProvider: () => null });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  bus.emit(Topics.BACKEND_CONNECTED);
  const search = globalThis.document.querySelector(".btn-rtt-search");
  assert.equal(search.disabled, false);
});

test("RttSession: init BACKEND_DISCONNECTED stops rtt client and updates buttons", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const s = new RttSession({ backendProvider: () => null });
  const fakeClient = makeFakeRttClient();
  s._rttClient = fakeClient;
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  bus.emit(Topics.BACKEND_DISCONNECTED);
  assert.equal(s._rttClient, null);
  const search = globalThis.document.querySelector(".btn-rtt-search");
  assert.equal(search.disabled, true);
});

test("RttSession: init cleanup unsubscribes bus listeners", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const s = new RttSession({ backendProvider: () => null });
  attachControls(s);
  const cleanup = s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  assert.equal(bus._topics.get(Topics.BACKEND_CONNECTED)?.size, 1);
  assert.equal(bus._topics.get(Topics.BACKEND_DISCONNECTED)?.size, 1);
  cleanup();
  assert.equal(bus._topics.get(Topics.BACKEND_CONNECTED)?.size || 0, 0);
  assert.equal(bus._topics.get(Topics.BACKEND_DISCONNECTED)?.size || 0, 0);
});

test("RttSession: Search with invalid RAM range sets error status", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const s = new RttSession({ backendProvider: () => ({ createRttSession: () => null }) });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  s._els.ramStartInput.value = "invalid";
  s._els.ramSizeInput.value = "0";
  s._onSearch();
  const status = globalThis.document.querySelector(".rtt-status");
  assert.ok(status.textContent.includes("Invalid"));
});

test("RttSession: Search button click with backend creates rtt client and searches", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const fakeClient = makeFakeRttClient();
  const s = new RttSession({ backendProvider: () => ({ createRttSession: () => fakeClient }) });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  const search = globalThis.document.querySelector(".btn-rtt-search");
  search.click();
  await new Promise(r => setTimeout(r, 5));
  assert.ok(s._rttClient);
});

test("RttSession: Search success updates status with block address and channel counts", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const fakeClient = makeFakeRttClient({ controlBlockAddr: 0x20000100, upChannelCount: 2, downChannelCount: 1 });
  const s = new RttSession({ backendProvider: () => ({ createRttSession: () => fakeClient }) });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  const search = globalThis.document.querySelector(".btn-rtt-search");
  search.click();
  await new Promise(r => setTimeout(r, 5));
  const status = globalThis.document.querySelector(".rtt-status");
  assert.ok(status.textContent.includes("0x20000100"));
  assert.ok(status.textContent.includes("2 up"));
  assert.ok(status.textContent.includes("1 down"));
});

test("RttSession: Search success enables Start button", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const fakeClient = makeFakeRttClient({ downChannelCount: 1 });
  const s = new RttSession({ backendProvider: () => ({ createRttSession: () => fakeClient }) });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  const search = globalThis.document.querySelector(".btn-rtt-search");
  search.click();
  await new Promise(r => setTimeout(r, 5));
  const start = globalThis.document.querySelector(".btn-rtt-start");
  assert.equal(start.disabled, false);
});

test("RttSession: Search success calls onReadyChange", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const fakeClient = makeFakeRttClient({ downChannelCount: 1 });
  const s = new RttSession({ backendProvider: () => ({ createRttSession: () => fakeClient }) });
  attachControls(s);
  let readyCalls = 0;
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => readyCalls++ });
  const search = globalThis.document.querySelector(".btn-rtt-search");
  search.click();
  await new Promise(r => setTimeout(r, 5));
  assert.equal(readyCalls, 1);
});

test("RttSession: Search failure (not found) sets error status", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const fakeClient = makeFakeRttClient({ searchResult: false });
  const s = new RttSession({ backendProvider: () => ({ createRttSession: () => fakeClient }) });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  const search = globalThis.document.querySelector(".btn-rtt-search");
  search.click();
  await new Promise(r => setTimeout(r, 5));
  const status = globalThis.document.querySelector(".rtt-status");
  assert.ok(status.textContent.includes("not found"));
  assert.equal(s._rttClient, null);
});

test("RttSession: Search exception sets error status with message", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const fakeClient = makeFakeRttClient({ searchThrows: true });
  const s = new RttSession({ backendProvider: () => ({ createRttSession: () => fakeClient }) });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  const search = globalThis.document.querySelector(".btn-rtt-search");
  search.click();
  await new Promise(r => setTimeout(r, 5));
  const status = globalThis.document.querySelector(".rtt-status");
  assert.ok(status.textContent.includes("search failed"));
  assert.equal(s._rttClient, null);
});

test("RttSession: Start button click without rtt client does nothing", () => {
  const s = new RttSession({ backendProvider: () => null });
  assert.doesNotThrow(() => s._onStart());
});

test("RttSession: Start button click with rtt client starts polling", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const s = new RttSession({ backendProvider: () => null });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  s._rttClient = makeFakeRttClient({ downChannelCount: 1 });
  s._onStart();
  assert.equal(s._rttClient._polling, true);
  assert.equal(s._rttClient._interval, 50);
});

test("RttSession: Start button click with rtt client updates status and buttons", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const s = new RttSession({ backendProvider: () => null });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  s._rttClient = makeFakeRttClient({ downChannelCount: 1 });
  s._onStart();
  assert.ok(s._els.status.textContent.includes("Polling"));
  assert.equal(s._els.btnStart.disabled, true);
  assert.equal(s._els.btnStop.disabled, false);
});

test("RttSession: Start button click calls onReadyChange", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const s = new RttSession({ backendProvider: () => null });
  attachControls(s);
  let readyCalls = 0;
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => readyCalls++ });
  s._rttClient = makeFakeRttClient({ downChannelCount: 1 });
  s._onStart();
  assert.equal(readyCalls, 1);
});

test("RttSession: Start button click uses interval from input", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const s = new RttSession({ backendProvider: () => null });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  s._rttClient = makeFakeRttClient({ downChannelCount: 1 });
  s._els.intervalInput.value = "100";
  s._onStart();
  assert.equal(s._rttClient._interval, 100);
});

test("RttSession: Start button click falls back to 50 when interval input is invalid", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const s = new RttSession({ backendProvider: () => null });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  s._rttClient = makeFakeRttClient({ downChannelCount: 1 });
  s._els.intervalInput.value = "abc";
  s._onStart();
  assert.equal(s._rttClient._interval, 50);
});

test("RttSession: Stop button click without rtt client does nothing", () => {
  const s = new RttSession({ backendProvider: () => null });
  assert.doesNotThrow(() => s._onStop());
});

test("RttSession: Stop button click with rtt client stops polling", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const s = new RttSession({ backendProvider: () => null });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  s._rttClient = makeFakeRttClient({ downChannelCount: 1 });
  s._rttClient._polling = true;
  s._onStop();
  assert.equal(s._rttClient._polling, false);
  assert.equal(s._rttClient._stopped, true);
  assert.ok(s._els.status.textContent.includes("Stopped"));
});

test("RttSession: data listener forwards bytes to _onData", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const s = new RttSession({ backendProvider: () => null });
  attachControls(s);
  const received = [];
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: (bytes) => received.push(new Uint8Array(bytes)), onReadyChange: () => {} });
  s._rttClient = makeFakeRttClient({ downChannelCount: 1 });
  s._onStart();
  const testBytes = new Uint8Array([0x41, 0x42]);
  s._rttClient._dataListeners[0]({ data: testBytes });
  assert.equal(received.length, 1);
  assert.deepEqual(received[0], testBytes);
});

test("RttSession: error listener updates status with error message", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const s = new RttSession({ backendProvider: () => null });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  s._rttClient = makeFakeRttClient({ downChannelCount: 1 });
  s._onStart();
  s._rttClient._errorListeners[0](new Error("poll error"));
  assert.ok(s._els.status.textContent.includes("poll error"));
});

test("RttSession: init button state when no backend available", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const s = new RttSession({ backendProvider: () => null });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  const search = globalThis.document.querySelector(".btn-rtt-search");
  assert.equal(search.disabled, true);
});

test("RttSession: init Search button enabled when backend available", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const s = new RttSession({ backendProvider: () => ({}) });
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  const search = globalThis.document.querySelector(".btn-rtt-search");
  assert.equal(search.disabled, false);
});

test("RttSession: Search stops any existing rtt client before creating new one", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const bus = new EventBus();
  const oldClient = makeFakeRttClient({ downChannelCount: 1 });
  oldClient._polling = true;
  const newClient = makeFakeRttClient({ downChannelCount: 1 });
  const s = new RttSession({ backendProvider: () => ({ createRttSession: () => newClient }) });
  s._rttClient = oldClient;
  attachControls(s);
  s.init({ rootEl: globalThis.document.getElementById("root"), bus, onData: () => {}, onReadyChange: () => {} });
  s._onSearch();
  assert.equal(oldClient._stopped, true);
  assert.equal(s._rttClient, newClient);
});
