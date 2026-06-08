// Run with: node --test --import ./tests/xterm-mock-init.mjs tests/xterm-terminal-panel.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { XtermTerminalPanel } from "../../src/ui/panels/xterm-terminal-panel.js";
import { TerminalSidebarController } from "../../src/ui/components/terminal-sidebar-controller.js";
import { EventBus } from "../../src/core/event-bus.js";
import { Topics } from "../../src/core/event-bus-topics.js";

let _store = {};
function setupStore() {
  _store = {};
  globalThis.localStorage = {
    getItem(k) { return _store[k] ?? null; },
    setItem(k, v) { _store[k] = v; },
    removeItem(k) { delete _store[k]; },
  };
}
function makeDomAndStore(html) {
  makeDom(html);
  globalThis.localStorage = {
    getItem(k) { return _store[k] ?? null; },
    setItem(k, v) { _store[k] = v; },
    removeItem(k) { delete _store[k]; },
  };
}

function makeFakeSession(opts = {}) {
  let ready = false;
  const session = {
    channelId: opts.channelId || "test",
    isReady: () => ready,
    setReady: (v) => { ready = v; },
    buildControls: opts.buildControls || (() => null),
    init: function(args) {
      this._initArgs = args;
      opts.onData = args.onData;
      opts.onReadyChange = args.onReadyChange;
      return () => {};
    },
    sendRaw: async () => {},
    _triggerData: (bytes) => opts.onData?.(bytes),
    _triggerReadyChange: () => opts.onReadyChange?.(),
  };
  return session;
}

test("XtermTerminalPanel: mount creates terminal-panel-grid inside container", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  const grid = root.querySelector(".terminal-panel-grid");
  assert.ok(grid);
});

test("XtermTerminalPanel: mount creates xterm-mount-point and terminal-toolbar", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  const grid = root.querySelector(".terminal-panel-grid");
  assert.ok(grid.querySelector(".xterm-mount-point"));
  assert.ok(grid.querySelector(".terminal-toolbar"));
});

test("XtermTerminalPanel: mount creates templates slot and queue slot", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  const grid = root.querySelector(".terminal-panel-grid");
  assert.ok(grid.querySelector(".terminal-templates-slot"));
  assert.ok(grid.querySelector(".terminal-queue-slot"));
});

test("XtermTerminalPanel: mount uses default font size 14 when no localStorage value", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  assert.equal(panel._term.options.fontSize, 14);
});

test("XtermTerminalPanel: mount uses saved font size from localStorage", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  _store["terminal:fontsize:test"] = "20";
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession({ channelId: "test" });
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  assert.equal(panel._term.options.fontSize, 20);
});

test("XtermTerminalPanel: mount calls session.init with rootEl, bus, backendProvider, onData, onReadyChange", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const backendProvider = () => null;
  const panel = new XtermTerminalPanel({ session, bus, backendProvider, logger: { log: () => {} } });
  panel.mount(root);
  assert.ok(session._initArgs);
  assert.equal(session._initArgs.bus, bus);
  assert.equal(session._initArgs.backendProvider, backendProvider);
  assert.equal(typeof session._initArgs.onData, "function");
  assert.equal(typeof session._initArgs.onReadyChange, "function");
});

test("XtermTerminalPanel: onData callback decodes and writes text to terminal", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  const text = "hello";
  session._triggerData(new TextEncoder().encode(text));
  assert.ok(panel._term.written.some(w => w.includes("hello")));
});

test("XtermTerminalPanel: onData appends text to _logLines", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  session._triggerData(new TextEncoder().encode("abc"));
  session._triggerData(new TextEncoder().encode("def"));
  assert.equal(panel._logLines.length, 2);
  assert.equal(panel._logLines.join(""), "abcdef");
});

test("XtermTerminalPanel: onReadyChange true writes green [connected] message", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  session.setReady(true);
  session._triggerReadyChange();
  assert.ok(panel._term.writelnCalls.some(c => c.includes("[connected]") && c.includes("\x1b[32m")));
});

test("XtermTerminalPanel: onReadyChange false writes yellow [disconnected] message", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  session.setReady(false);
  session._triggerReadyChange();
  assert.ok(panel._term.writelnCalls.some(c => c.includes("[disconnected]") && c.includes("\x1b[33m")));
});

test("XtermTerminalPanel: mount installs ResizeObserver on container", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  assert.ok(panel._resizeObserver);
  assert.equal(panel._resizeObserver._target, root);
});

test("XtermTerminalPanel: unmount disconnects ResizeObserver", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  let disconnected = false;
  panel.mount(root);
  panel._resizeObserver.disconnect = () => { disconnected = true; };
  panel.unmount();
  assert.equal(disconnected, true);
});

test("XtermTerminalPanel: unmount calls session cleanup function", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  let cleanupCalled = false;
  const session = {
    ...makeFakeSession(),
    init: (args) => { return () => { cleanupCalled = true; }; },
  };
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  panel.unmount();
  assert.equal(cleanupCalled, true);
});

test("XtermTerminalPanel: unmount calls term.dispose", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  const term = panel._term;
  assert.ok(term);
  panel.unmount();
  assert.equal(term.disposed, true);
});

test("XtermTerminalPanel: unmount clears _logLines and nulls refs", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  panel.unmount();
  assert.equal(panel._logLines.length, 0);
  assert.equal(panel._term, null);
  assert.equal(panel._fitAddon, null);
  assert.equal(panel._searchAddon, null);
});

test("XtermTerminalPanel: mount with buildControls creates transport button", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const transportEl = globalThis.document.createElement("div");
  transportEl.textContent = "transport";
  const session = makeFakeSession({ buildControls: () => transportEl });
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  const transportBtn = root.querySelector(".toolbar-btn");
  assert.ok(transportBtn);
});

test("XtermTerminalPanel: mount without buildControls does NOT create transport button", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession({ buildControls: () => null });
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  const transportPanel = root.querySelector(".xterm-transport-dropdown");
  assert.equal(transportPanel, null);
});

test("XtermTerminalPanel: transport button click toggles dropdown", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const transportEl = globalThis.document.createElement("div");
  const session = makeFakeSession({ buildControls: () => transportEl });
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  const transportBtn = Array.from(root.querySelectorAll(".toolbar-btn")).find(b => b.title?.includes("Transport"));
  assert.ok(transportBtn);
  transportBtn.click();
  const dropdown = root.querySelector(".xterm-transport-dropdown");
  assert.equal(dropdown.style.display, "block");
});

test("XtermTerminalPanel: search dropdown opens and runs findNext on Enter", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  const searchBtn = Array.from(root.querySelectorAll(".toolbar-btn")).find(b => b.title === "Search");
  searchBtn.click();
  const dropdown = root.querySelector(".terminal-dropdown");
  assert.equal(dropdown.style.display, "block");
});

test("XtermTerminalPanel: clear button calls term.clear and resets _logLines", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  session._triggerData(new TextEncoder().encode("hello"));
  assert.equal(panel._logLines.length, 1);
  const settingsBtn = Array.from(root.querySelectorAll(".toolbar-btn")).find(b => b.title === "Settings");
  settingsBtn.click();
  const clearBtn = root.querySelector(".dd-clear");
  clearBtn.click();
  assert.equal(panel._term._cleared, true);
  assert.equal(panel._logLines.length, 0);
});

test("XtermTerminalPanel: A+ font button increases font size", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  const settingsBtn = Array.from(root.querySelectorAll(".toolbar-btn")).find(b => b.title === "Settings");
  settingsBtn.click();
  const inc = root.querySelector(".btn-font-increase");
  inc.click();
  assert.equal(panel._term.options.fontSize, 15);
});

test("XtermTerminalPanel: A- font button decreases font size", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  const settingsBtn = Array.from(root.querySelectorAll(".toolbar-btn")).find(b => b.title === "Settings");
  settingsBtn.click();
  const dec = root.querySelector(".btn-font-decrease");
  dec.click();
  assert.equal(panel._term.options.fontSize, 13);
});

test("XtermTerminalPanel: font size persists to localStorage", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  const settingsBtn = Array.from(root.querySelectorAll(".toolbar-btn")).find(b => b.title === "Settings");
  settingsBtn.click();
  const inc = root.querySelector(".btn-font-increase");
  inc.click();
  assert.equal(_store["terminal:fontsize:test"], "15");
});

test("XtermTerminalPanel: font size clamped to 8 minimum", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  const settingsBtn = Array.from(root.querySelectorAll(".toolbar-btn")).find(b => b.title === "Settings");
  settingsBtn.click();
  const dec = root.querySelector(".btn-font-decrease");
  for (let i = 0; i < 10; i++) dec.click();
  assert.equal(panel._term.options.fontSize, 8);
});

test("XtermTerminalPanel: font size clamped to 32 maximum", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  const settingsBtn = Array.from(root.querySelectorAll(".toolbar-btn")).find(b => b.title === "Settings");
  settingsBtn.click();
  const inc = root.querySelector(".btn-font-increase");
  for (let i = 0; i < 30; i++) inc.click();
  assert.equal(panel._term.options.fontSize, 32);
});

test("XtermTerminalPanel: fullscreen button toggles terminal-fullscreen class", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  const fsBtn = Array.from(root.querySelectorAll(".toolbar-btn")).find(b => b.title === "Fullscreen");
  fsBtn.click();
  const grid = root.querySelector(".terminal-panel-grid");
  assert.equal(grid.classList.contains("terminal-fullscreen"), true);
  fsBtn.click();
  assert.equal(grid.classList.contains("terminal-fullscreen"), false);
});

test("XtermTerminalPanel: download log button uses downloadLog helper", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const session = makeFakeSession();
  const bus = new EventBus();
  const panel = new XtermTerminalPanel({ session, bus, backendProvider: () => null, logger: { log: () => {} } });
  panel.mount(root);
  let clickedAnchor = null;
  let createdBlob = null;
  const origCreate = globalThis.document.createElement.bind(globalThis.document);
  globalThis.document.createElement = (tag) => {
    const el = origCreate(tag);
    if (tag === "a") {
      el.click = function() { clickedAnchor = this; };
    }
    return el;
  };
  globalThis.Blob = class { constructor(parts, opts) { createdBlob = { text: parts.join(""), type: opts?.type }; } };
  globalThis.URL.createObjectURL = () => "blob:fake";
  globalThis.URL.revokeObjectURL = () => {};
  const settingsBtn = Array.from(root.querySelectorAll(".toolbar-btn")).find(b => b.title === "Settings");
  settingsBtn.click();
  const dlBtn = root.querySelector(".dd-download");
  dlBtn.click();
  assert.ok(clickedAnchor);
  assert.equal(createdBlob.type, "text/plain");
  assert.ok(clickedAnchor.download.startsWith("test-log-"));
});
