import test from "node:test";
import assert from "node:assert/strict";

let _store = {};

function setup() {
  _store = {};
  globalThis.localStorage = {
    getItem(k) { return _store[k] ?? null; },
    setItem(k, v) { _store[k] = v; },
    removeItem(k) { delete _store[k]; },
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
  };
}

import {
  pushHistory,
  getHistory,
  loadHistory,
  clearHistory,
  subscribe,
} from "../../src/ui/components/terminal-history-store.js";

test("terminal-history-store: push and get", () => {
  setup();
  clearHistory();
  pushHistory("cmd1");
  assert.deepEqual(getHistory(), ["cmd1"]);
  pushHistory("cmd2");
  assert.deepEqual(getHistory(), ["cmd1", "cmd2"]);
});

test("terminal-history-store: dedup vs last", () => {
  setup();
  clearHistory();
  pushHistory("A");
  pushHistory("A");
  assert.deepEqual(getHistory(), ["A"]);
  pushHistory("B");
  assert.deepEqual(getHistory(), ["A", "B"]);
});

test("terminal-history-store: cap at 500, oldest dropped", () => {
  setup();
  clearHistory();
  for (let i = 0; i < 502; i++) pushHistory(`cmd${i}`);
  const h = getHistory();
  assert.equal(h.length, 500);
  assert.equal(h[0], "cmd2");
  assert.equal(h[499], "cmd501");
});

test("terminal-history-store: save and load round-trip", () => {
  setup();
  clearHistory();
  pushHistory("save1");
  pushHistory("save2");
  assert.deepEqual(loadHistory(), ["save1", "save2"]);
});

test("terminal-history-store: clear empties", () => {
  setup();
  clearHistory();
  pushHistory("a");
  pushHistory("b");
  clearHistory();
  assert.deepEqual(getHistory(), []);
  assert.equal(_store["terminal:history"], undefined);
});

test("terminal-history-store: subscribe emits on push", () => {
  setup();
  clearHistory();
  let emitted = false;
  subscribe(() => { emitted = true; });
  pushHistory("x");
  assert.ok(emitted);
});
