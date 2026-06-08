import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { BasePanel } from "../../src/ui/panels/base-panel.js";

test("BasePanel: _bindBusListener calls bus.on and stores unsubscribe", () => {
  const p = new BasePanel();
  const bus = { onCalls: [], on(topic, fn) { this.onCalls.push({ topic, fn }); return () => { this.unsubs.push(topic); }; } };
  bus.unsubs = [];
  const fn = () => {};
  p._bindBusListener(bus, "T1", fn);
  assert.equal(bus.onCalls.length, 1);
  assert.equal(bus.onCalls[0].topic, "T1");
  assert.equal(bus.onCalls[0].fn, fn);
});

test("BasePanel: _teardown calls all bus unsubscribers", () => {
  const p = new BasePanel();
  const unsub1 = { called: false };
  const unsub2 = { called: false };
  p._unsubs.push(() => { unsub1.called = true; });
  p._unsubs.push(() => { unsub2.called = true; });
  p._teardown();
  assert.equal(unsub1.called, true);
  assert.equal(unsub2.called, true);
});

test("BasePanel: _teardown clears _unsubs and _domBindings", () => {
  makeDom("<button id='b'></button>");
  const el = globalThis.document.getElementById("b");
  const p = new BasePanel();
  p._unsubs.push(() => {});
  p._domBindings.push({ el, event: "click", fn: () => {} });
  p._teardown();
  assert.equal(p._unsubs.length, 0);
  assert.equal(p._domBindings.length, 0);
});

test("BasePanel: _bindDomListener calls addEventListener and stores binding", () => {
  makeDom("<button id='b'>x</button>");
  const el = globalThis.document.getElementById("b");
  let addedListener = null;
  const origAdd = el.addEventListener.bind(el);
  el.addEventListener = (event, fn) => { addedListener = { event, fn }; origAdd(event, fn); };

  const p = new BasePanel();
  const fn = () => {};
  p._bindDomListener(el, "click", fn);
  assert.equal(addedListener.event, "click");
  assert.equal(addedListener.fn, fn);
  assert.equal(p._domBindings.length, 1);
  assert.equal(p._domBindings[0].el, el);
  assert.equal(p._domBindings[0].event, "click");
  assert.equal(p._domBindings[0].fn, fn);
});

test("BasePanel: _teardown calls removeEventListener for each binding", () => {
  makeDom("<button id='b1'></button><button id='b2'></button>");
  const el1 = globalThis.document.getElementById("b1");
  const el2 = globalThis.document.getElementById("b2");
  const removed = [];
  el1.removeEventListener = (e, fn) => removed.push({ el: el1, e, fn });
  el2.removeEventListener = (e, fn) => removed.push({ el: el2, e, fn });

  const p = new BasePanel();
  const fn1 = () => {};
  const fn2 = () => {};
  p._bindDomListener(el1, "click", fn1);
  p._bindDomListener(el2, "input", fn2);
  p._teardown();
  assert.equal(removed.length, 2);
  assert.equal(removed[0].el, el1);
  assert.equal(removed[0].e, "click");
  assert.equal(removed[0].fn, fn1);
  assert.equal(removed[1].el, el2);
  assert.equal(removed[1].e, "input");
  assert.equal(removed[1].fn, fn2);
});

test("BasePanel: _teardown works with no listeners registered (no-op)", () => {
  const p = new BasePanel();
  assert.doesNotThrow(() => p._teardown());
  assert.equal(p._unsubs.length, 0);
  assert.equal(p._domBindings.length, 0);
});

test("BasePanel: multiple _bindBusListener calls store multiple unsubs", () => {
  const p = new BasePanel();
  const bus = { on: () => () => {} };
  p._bindBusListener(bus, "T1", () => {});
  p._bindBusListener(bus, "T2", () => {});
  p._bindBusListener(bus, "T3", () => {});
  assert.equal(p._unsubs.length, 3);
});

test("BasePanel: multiple _bindDomListener calls store multiple bindings", () => {
  makeDom("<button id='b'></button>");
  const el = globalThis.document.getElementById("b");
  const p = new BasePanel();
  p._bindDomListener(el, "click", () => {});
  p._bindDomListener(el, "input", () => {});
  p._bindDomListener(el, "change", () => {});
  assert.equal(p._domBindings.length, 3);
});
