import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { downloadLog, autoScrollObserver } from "../../src/ui/log-panel-helpers.js";

test("downloadLog: creates anchor with object URL and triggers download", () => {
  const w = makeDom("");
  let blobCreated = null;
  let urlCreatedFrom = null;
  let revoked = null;
  w.URL.createObjectURL = (blob) => { blobCreated = blob; urlCreatedFrom = blob; return "blob:fake-url"; };
  w.URL.revokeObjectURL = (url) => { revoked = url; };

  let clickedEl = null;
  const origCreateElement = w.document.createElement.bind(w.document);
  w.document.createElement = (tag) => {
    const el = origCreateElement(tag);
    if (tag === "a") {
      el.click = function() { clickedEl = this; };
    }
    return el;
  };

  globalThis.Blob = class Blob {
    constructor(parts, opts) {
      this.parts = parts;
      this.type = opts?.type || "";
      this.text = Array.isArray(parts) ? parts.join("") : String(parts);
    }
  };

  downloadLog("hello\nworld", "test.log");
  assert.ok(blobCreated);
  assert.equal(blobCreated.type, "text/plain");
  assert.equal(blobCreated.text, "hello\nworld");
  assert.equal(clickedEl.href, "blob:fake-url");
  assert.equal(clickedEl.download, "test.log");
  assert.equal(revoked, "blob:fake-url");
});

test("downloadLog: appends and removes anchor from document.body", () => {
  const w = makeDom("<div id='parent'></div>");
  let appended = false;
  let removed = false;
  const origAppend = w.document.body.appendChild.bind(w.document.body);
  w.document.body.appendChild = (el) => { appended = true; return origAppend(el); };
  const origRemove = w.document.body.removeChild.bind(w.document.body);
  w.document.body.removeChild = (el) => { removed = true; return origRemove(el); };

  globalThis.Blob = class Blob { constructor(parts, opts) { this.parts = parts; this.type = opts?.type || ""; this.text = ""; } };

  downloadLog("data", "x.txt");
  assert.equal(appended, true);
  assert.equal(removed, true);
});

test("autoScrollObserver: returns a MutationObserver instance", () => {
  makeDom("<div id='el'></div><input type='checkbox' id='cb' />");
  const el = globalThis.document.getElementById("el");
  const cb = globalThis.document.getElementById("cb");
  const obs = autoScrollObserver(el, cb);
  assert.ok(obs);
  assert.equal(typeof obs.observe, "function");
  assert.equal(typeof obs.disconnect, "function");
});

test("autoScrollObserver: scrollTop set to scrollHeight when checkbox checked", () => {
  makeDom("<div id='el'></div><input type='checkbox' id='cb' checked />");
  const el = globalThis.document.getElementById("el");
  const cb = globalThis.document.getElementById("cb");
  cb.checked = true;
  let lastScrollTop = -1;
  let lastScrollHeight = -1;
  Object.defineProperty(el, "scrollHeight", { get: () => lastScrollHeight, configurable: true });
  Object.defineProperty(el, "scrollTop", {
    get: () => lastScrollTop,
    set: (v) => { lastScrollTop = v; },
    configurable: true,
  });
  lastScrollHeight = 1000;

  const calls = [];
  const origObserve = globalThis.MutationObserver.prototype.observe;
  const origDisconnect = globalThis.MutationObserver.prototype.disconnect;
  globalThis.MutationObserver.prototype.observe = function(target, opts) { calls.push({ type: "observe", target, opts }); };
  globalThis.MutationObserver.prototype.disconnect = function() { calls.push({ type: "disconnect" }); };

  globalThis.MutationObserver = class {
    constructor(cb) { this._cb = cb; }
    observe() { calls.push({ type: "observe" }); }
    disconnect() { calls.push({ type: "disconnect" }); }
    trigger() { this._cb([{ target: {} }]); }
  };

  const obs = autoScrollObserver(el, cb);
  obs.trigger();
  assert.equal(lastScrollTop, 1000);

  globalThis.MutationObserver.prototype.observe = origObserve;
  globalThis.MutationObserver.prototype.disconnect = origDisconnect;
});

test("autoScrollObserver: does NOT scroll when checkbox unchecked", () => {
  makeDom("<div id='el'></div><input type='checkbox' id='cb' />");
  const el = globalThis.document.getElementById("el");
  const cb = globalThis.document.getElementById("cb");
  cb.checked = false;
  let lastScrollTop = -1;
  Object.defineProperty(el, "scrollHeight", { get: () => 1000, configurable: true });
  Object.defineProperty(el, "scrollTop", {
    get: () => lastScrollTop,
    set: (v) => { lastScrollTop = v; },
    configurable: true,
  });

  globalThis.MutationObserver = class {
    constructor(cb) { this._cb = cb; }
    observe() {}
    disconnect() {}
    trigger() { this._cb([{ target: {} }]); }
  };

  const obs = autoScrollObserver(el, cb);
  obs.trigger();
  assert.equal(lastScrollTop, -1);
});

test("autoScrollObserver: observe is called with correct mutation options", () => {
  makeDom("<div id='el'></div><input type='checkbox' id='cb' />");
  const el = globalThis.document.getElementById("el");
  const cb = globalThis.document.getElementById("cb");

  const observedArgs = [];
  globalThis.MutationObserver = class {
    constructor(cb) { this._cb = cb; }
    observe(target, opts) { observedArgs.push({ target, opts }); }
    disconnect() {}
  };

  autoScrollObserver(el, cb);
  assert.equal(observedArgs.length, 1);
  assert.equal(observedArgs[0].target, el);
  assert.deepEqual(observedArgs[0].opts, { childList: true, characterData: true, subtree: true });
});
