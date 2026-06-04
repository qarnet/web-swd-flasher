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
  deriveVars,
  resolve,
  saveTemplate,
  deleteTemplate,
  setVarValue,
  getVarValues,
  getTemplates,
  subscribe,
} from "../../src/ui/components/terminal-template-store.js";

test("terminal-template-store: deriveVars extracts placeholders", () => {
  setup();
  assert.deepEqual(deriveVars("${A}x${B}${A}"), ["A", "B"]);
  assert.deepEqual(deriveVars("no vars here"), []);
});

test("terminal-template-store: resolve substitutes values", () => {
  setup();
  assert.equal(resolve("${A}+${B}", { A: "1" }), "1+");
  assert.equal(resolve("hello ${X}", { X: "world" }), "hello world");
  assert.equal(resolve("${MISSING}", {}), "");
});

test("terminal-template-store: save rejects duplicate name case-insensitive", () => {
  setup();
  const r1 = saveTemplate({ name: "MyCmd", body: "${A}" });
  assert.ok(r1.ok);
  const r2 = saveTemplate({ name: "mycmd", body: "${B}" });
  assert.equal(r2.ok, false);
  assert.ok(r2.reason.includes("Duplicate"));
  deleteTemplate(r1.id);
});

test("terminal-template-store: save enforces cap", () => {
  setup();
  const ids = [];
  for (let i = 0; i < 50; i++) {
    const r = saveTemplate({ name: `tpl${i}`, body: "x" });
    assert.ok(r.ok, `tpl${i} should save`);
    if (r.id) ids.push(r.id);
  }
  const r = saveTemplate({ name: "extra", body: "y" });
  assert.equal(r.ok, false);
  assert.ok(r.reason.includes("cap"));
  for (const id of ids) deleteTemplate(id);
});

test("terminal-template-store: delete removes template and vars", () => {
  setup();
  const r = saveTemplate({ name: "Test", body: "${X}" });
  const id = r.id;
  setVarValue(id, "X", "val");
  deleteTemplate(id);
  assert.deepEqual(getTemplates(), []);
  assert.deepEqual(getVarValues(id), {});
});

test("terminal-template-store: setVarValue stores and retrieves", () => {
  setup();
  const r = saveTemplate({ name: "Cmd", body: "${PORT}" });
  const id = r.id;
  setVarValue(id, "PORT", "COM3");
  assert.deepEqual(getVarValues(id), { PORT: "COM3" });
  deleteTemplate(id);
});

test("terminal-template-store: edit template body re-derives vars", () => {
  setup();
  const r = saveTemplate({ name: "T", body: "${A}" });
  const id = r.id;
  const r2 = saveTemplate({ id, name: "T", body: "${A},${B}" });
  assert.ok(r2.ok);
  const tpl = getTemplates().find(t => t.id === id);
  assert.deepEqual(tpl.vars, ["A", "B"]);
  deleteTemplate(id);
});

test("terminal-template-store: subscribe emits on change", () => {
  setup();
  let emitted = false;
  subscribe(() => { emitted = true; });
  const r = saveTemplate({ name: "Sub", body: "x" });
  assert.ok(emitted);
  deleteTemplate(r.id);
});
