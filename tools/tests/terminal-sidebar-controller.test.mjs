import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { TerminalSidebarController } from "../../src/ui/components/terminal-sidebar-controller.js";
import { saveTemplate as saveTpl, deleteTemplate as deleteTpl, getTemplates } from "../../src/ui/components/terminal-template-store.js";
import { pushHistory, clearHistory } from "../../src/ui/components/terminal-history-store.js";

let _store = {};
function setupStore() {
  for (const t of getTemplates()) deleteTpl(t.id);
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
function seedQueue(items) {
  globalThis.localStorage.setItem("terminal:queue", JSON.stringify(items));
}
function seedStoreDirect(key, value) {
  _store[key] = value;
}
function getStoreValue(key) {
  return _store[key];
}

test("sidebar: mount creates .terminal-templates aside with title and new button", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const send = async () => {};
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send, isReady: () => true });
  ctrl.mount();
  const tpl = root.querySelector(".terminal-templates");
  assert.ok(tpl);
  assert.equal(tpl.dataset.channel, "test");
  const title = tpl.querySelector(".sidebar-title");
  assert.ok(title);
  assert.equal(title.textContent, "Templates");
  const list = tpl.querySelector(".template-list");
  assert.ok(list);
  const newBtn = tpl.querySelector(".template-new");
  assert.ok(newBtn);
  assert.equal(newBtn.textContent, "+ New template");
});

test("sidebar: mount creates .terminal-queue aside", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  const q = root.querySelector(".terminal-queue");
  assert.ok(q);
  const title = q.querySelector(".sidebar-title");
  assert.equal(title.textContent, "Command Queue");
});

test("sidebar: + New template button click opens editor form", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  const newBtn = root.querySelector(".template-new");
  newBtn.click();
  const form = root.querySelector(".template-edit-form");
  assert.ok(form);
  assert.ok(form.querySelector(".tpl-edit-name"));
  assert.ok(form.querySelector(".tpl-edit-body"));
  assert.ok(form.querySelector(".tpl-edit-save"));
  assert.ok(form.querySelector(".tpl-edit-cancel"));
});

test("sidebar: + New template form fields are empty by default", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  root.querySelector(".template-new").click();
  const form = root.querySelector(".template-edit-form");
  assert.equal(form.querySelector(".tpl-edit-name").value, "");
  assert.equal(form.querySelector(".tpl-edit-body").value, "");
  assert.equal(form.querySelector(".tpl-edit-name").getAttribute("maxlength"), "60");
  assert.equal(form.querySelector(".tpl-edit-body").getAttribute("maxlength"), "2000");
});

test("sidebar: editor save with valid template removes form", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  root.querySelector(".template-new").click();
  const form = root.querySelector(".template-edit-form");
  form.querySelector(".tpl-edit-name").value = "MyTpl";
  form.querySelector(".tpl-edit-body").value = "${VAR}";
  form.querySelector(".tpl-edit-save").click();
  assert.equal(root.querySelector(".template-edit-form"), null);
});

test("sidebar: editor save with invalid (empty) name shows error", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  root.querySelector(".template-new").click();
  const form = root.querySelector(".template-edit-form");
  form.querySelector(".tpl-edit-save").click();
  const err = form.querySelector(".tpl-error");
  assert.equal(err.style.display, "block");
  assert.ok(err.textContent.length > 0);
});

test("sidebar: editor cancel button removes form", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  root.querySelector(".template-new").click();
  const form = root.querySelector(".template-edit-form");
  form.querySelector(".tpl-edit-cancel").click();
  assert.equal(root.querySelector(".template-edit-form"), null);
});

test("sidebar: edit existing template pre-fills name and body", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const r = saveTpl({ name: "Existing", body: "${X}" });
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  const editBtn = root.querySelector(".tpl-edit-btn");
  editBtn.click();
  const form = root.querySelector(".template-edit-form");
  assert.equal(form.querySelector(".tpl-edit-name").value, "Existing");
  assert.equal(form.querySelector(".tpl-edit-body").value, "${X}");
  deleteTpl(r.id);
});

test("sidebar: template delete button shows confirm and calls deleteTpl", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  let confirmMsg = null;
  globalThis.window.confirm = (msg) => { confirmMsg = msg; return true; };
  const r = saveTpl({ name: "Del", body: "x" });
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  const delBtn = root.querySelector(".tpl-delete-btn");
  delBtn.click();
  assert.ok(confirmMsg.includes("Del"));
  const remaining = root.querySelectorAll(".template-card");
  assert.equal(remaining.length, 0);
  deleteTpl(r.id);
});

test("sidebar: template delete does NOT call deleteTpl when confirm cancelled", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  globalThis.window.confirm = () => false;
  const r = saveTpl({ name: "Keep", body: "x" });
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  const delBtn = root.querySelector(".tpl-delete-btn");
  delBtn.click();
  const remaining = root.querySelectorAll(".template-card");
  assert.equal(remaining.length, 1);
  deleteTpl(r.id);
});

test("sidebar: variable input shows current value and 'unset' chip when empty", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const r = saveTpl({ name: "VarTpl", body: "${PORT}" });
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  const card = root.querySelector(".template-card");
  const input = card.querySelector("input[data-var='PORT']");
  assert.equal(input.value, "");
  const chip = card.querySelector(".unset-chip");
  assert.ok(chip);
  assert.equal(chip.textContent, "unset");
  deleteTpl(r.id);
});

test("sidebar: variable input change persists value", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const r = saveTpl({ name: "T", body: "${V}" });
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  const input = root.querySelector("input[data-var='V']");
  input.value = "newval";
  input.dispatchEvent(new globalThis.window.Event("change", { bubbles: true }));
  const raw = JSON.parse(_store["terminal:template-vars"]);
  assert.equal(raw[r.id].V, "newval");
  deleteTpl(r.id);
});

test("sidebar: Buffer button calls _onTemplateBufferCb with resolved body", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  let buffered = null;
  const r = saveTpl({ name: "Buf", body: "${X}" });
  const ctrl = new TerminalSidebarController({
    rootEl: root, channelId: "test", send: async () => {}, isReady: () => true,
    onTemplateBuffer: (s) => { buffered = s; },
  });
  ctrl.mount();
  const input = root.querySelector("input[data-var='X']");
  input.value = "1";
  input.dispatchEvent(new globalThis.window.Event("change", { bubbles: true }));
  root.querySelector(".tpl-buffer-btn").click();
  assert.equal(buffered, "1");
  deleteTpl(r.id);
});

test("sidebar: Send button calls _send with resolved body when ready", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const sent = [];
  const r = saveTpl({ name: "Snd", body: "${X}" });
  const ctrl = new TerminalSidebarController({
    rootEl: root, channelId: "test", send: async (s) => { sent.push(s); }, isReady: () => true,
  });
  ctrl.mount();
  const input = root.querySelector("input[data-var='X']");
  input.value = "hi";
  input.dispatchEvent(new globalThis.window.Event("change", { bubbles: true }));
  root.querySelector(".tpl-send-btn").click();
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(sent, ["hi"]);
  deleteTpl(r.id);
});

test("sidebar: Send button does NOT call _send when not ready", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const sent = [];
  const r = saveTpl({ name: "Snd2", body: "${X}" });
  const ctrl = new TerminalSidebarController({
    rootEl: root, channelId: "test", send: async (s) => { sent.push(s); }, isReady: () => false,
  });
  ctrl.mount();
  root.querySelector(".tpl-send-btn").click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(sent.length, 0);
  deleteTpl(r.id);
});

test("sidebar: Send button pushes to history on success", async () => {
  setupStore();
  clearHistory();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const r = saveTpl({ name: "HistTpl", body: "${X}" });
  const ctrl = new TerminalSidebarController({
    rootEl: root, channelId: "test", send: async () => {}, isReady: () => true,
  });
  ctrl.mount();
  const input = root.querySelector("input[data-var='X']");
  input.value = "hello";
  input.dispatchEvent(new globalThis.window.Event("change", { bubbles: true }));
  root.querySelector(".tpl-send-btn").click();
  await new Promise(r => setTimeout(r, 10));
  const raw = JSON.parse(_store["terminal:history"] ?? "[]");
  assert.ok(raw.includes("hello"));
  deleteTpl(r.id);
  clearHistory();
});

test("sidebar: Send button logs error when send throws", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const logCalls = [];
  const r = saveTpl({ name: "FailTpl", body: "${X}" });
  const ctrl = new TerminalSidebarController({
    rootEl: root, channelId: "test",
    send: async () => { throw new Error("boom"); },
    isReady: () => true,
    logger: { log: (s) => logCalls.push(s) },
  });
  ctrl.mount();
  const input = root.querySelector("input[data-var='X']");
  input.value = "v";
  input.dispatchEvent(new globalThis.window.Event("change", { bubbles: true }));
  root.querySelector(".tpl-send-btn").click();
  await new Promise(r => setTimeout(r, 20));
  assert.ok(logCalls.some(c => c.includes("send failed")), `got: ${JSON.stringify(logCalls)}`);
  deleteTpl(r.id);
});

test("sidebar: queue renders with no items when localStorage empty", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  const q = root.querySelector(".terminal-queue");
  const items = q.querySelectorAll(".queue-item");
  assert.equal(items.length, 0);
});

test("sidebar: queue loads items from localStorage on mount", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  seedQueue([
    { id: "a", text: "first", delayMs: 100 },
    { id: "b", text: "second", delayMs: 0 },
  ]);
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  const items = root.querySelectorAll(".queue-item");
  assert.equal(items.length, 2);
  assert.equal(items[0].querySelector(".q-item-text").textContent, "first");
  assert.equal(items[0].querySelector(".q-item-delay-input").value, "100");
});

test("sidebar: queue shows Send Queue button when not running", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  const sendBtn = root.querySelector(".q-send-queue");
  assert.equal(sendBtn.textContent, "Send Queue");
});

test("sidebar: queue Stop button disabled when not running", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  const stopBtn = root.querySelector(".q-stop-queue");
  assert.equal(stopBtn.disabled, true);
});

test("sidebar: queue Clear button enabled when not running", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  const clearBtn = root.querySelector(".q-clear-queue");
  assert.equal(clearBtn.disabled, false);
});

test("sidebar: queue remove button disabled for running item", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  seedQueue([{ id: "a", text: "x", delayMs: 0, status: "running" }]);
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  const remBtn = root.querySelector(".q-item-remove");
  assert.equal(remBtn.disabled, true);
});

test("sidebar: queue remove button enabled for non-running item", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  seedQueue([{ id: "a", text: "x", delayMs: 0, status: "pending" }]);
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  const remBtn = root.querySelector(".q-item-remove");
  assert.equal(remBtn.disabled, false);
});

test("sidebar: queue delay input change updates item delayMs", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  seedQueue([{ id: "a", text: "x", delayMs: 0, status: "pending" }]);
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  const input = root.querySelector(".q-item-delay-input");
  input.value = "500";
  input.dispatchEvent(new globalThis.window.Event("change", { bubbles: true }));
  const saved = JSON.parse(_store["terminal:queue"]);
  assert.equal(saved[0].delayMs, 500);
});

test("sidebar: queue delay input non-numeric parses to 0", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  seedQueue([{ id: "a", text: "x", delayMs: 100, status: "pending" }]);
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  const input = root.querySelector(".q-item-delay-input");
  input.value = "abc";
  input.dispatchEvent(new globalThis.window.Event("change", { bubbles: true }));
  const saved = JSON.parse(_store["terminal:queue"]);
  assert.equal(saved[0].delayMs, 0);
});

test("sidebar: queue Send Queue button calls queueRunner.start()", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  seedQueue([{ id: "a", text: "x", delayMs: 0, status: "pending" }]);
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  assert.equal(ctrl.queueRunner.isRunning(), false);
  root.querySelector(".q-send-queue").click();
  assert.equal(ctrl.queueRunner.isRunning(), true);
  ctrl.queueRunner.stop();
});

test("sidebar: queue Stop button calls queueRunner.stop()", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  seedQueue([{ id: "a", text: "x", delayMs: 0, status: "pending" }]);
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  ctrl.queueRunner.start();
  await new Promise(r => setTimeout(r, 5));
  root.querySelector(".q-stop-queue").click();
  assert.equal(ctrl.queueRunner.isRunning(), false);
});

test("sidebar: queue Clear button without items does not show confirm", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  let confirmCalled = false;
  globalThis.window.confirm = () => { confirmCalled = true; return true; };
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  root.querySelector(".q-clear-queue").click();
  assert.equal(confirmCalled, false);
});

test("sidebar: queue Clear button with items shows confirm", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  seedQueue([{ id: "a", text: "x", delayMs: 0, status: "pending" }]);
  const root = globalThis.document.getElementById("root");
  let confirmCalled = false;
  globalThis.window.confirm = () => { confirmCalled = true; return true; };
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  root.querySelector(".q-clear-queue").click();
  assert.equal(confirmCalled, true);
});

test("sidebar: queue Export button creates blob and triggers download", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  const exportBtn = root.querySelector(".q-export");
  let clickedAnchor = null;
  const origCreate = globalThis.document.createElement.bind(globalThis.document);
  globalThis.document.createElement = (tag) => {
    const el = origCreate(tag);
    if (tag === "a") {
      el.click = function() { clickedAnchor = this; };
    }
    return el;
  };
  globalThis.Blob = class { constructor(parts, opts) { this.parts = parts; this.type = opts?.type || ""; this.text = parts.join(""); } };
  exportBtn.click();
  assert.ok(clickedAnchor);
  assert.equal(clickedAnchor.download.startsWith("terminal-config-"), true);
});

test("sidebar: queue Import button opens file picker", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  let fileInput = null;
  const origCreate = globalThis.document.createElement.bind(globalThis.document);
  globalThis.document.createElement = (tag) => {
    const el = origCreate(tag);
    if (tag === "input") {
      el.click = function() { fileInput = this; };
    }
    return el;
  };
  root.querySelector(".q-import").click();
  assert.ok(fileInput);
  assert.equal(fileInput.type, "file");
  assert.equal(fileInput.accept, ".json,application/json");
});

test("sidebar: queue Import with valid JSON imports templates and queue", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  let alertMsg = null;
  globalThis.window.alert = (m) => { alertMsg = m; };
  let fileInput = null;
  const origCreate = globalThis.document.createElement.bind(globalThis.document);
  globalThis.document.createElement = (tag) => {
    const el = origCreate(tag);
    if (tag === "input") {
      el.click = function() { fileInput = this; };
    }
    return el;
  };
  root.querySelector(".q-import").click();
  assert.ok(fileInput);
  const config = JSON.stringify({
    version: 1,
    templates: [{ id: "t1", name: "Imp", body: "${X}", vars: ["X"] }],
    queue: [{ id: "q1", text: "impcmd", delayMs: 0 }],
  });
  fileInput.files = [{ text: async () => config }];
  await fileInput.dispatchEvent(new globalThis.window.Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 20));
  assert.ok(alertMsg, "alertMsg should be set");
  assert.ok(alertMsg.includes("Templates"));
  assert.ok(alertMsg.includes("Queue"));
  const saved = JSON.parse(_store["terminal:queue"]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].text, "impcmd");
  deleteTpl("t1");
});

test("sidebar: queue Import with invalid JSON shows error alert", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  let alertMsg = null;
  globalThis.window.alert = (m) => { alertMsg = m; };
  let fileInput = null;
  const origCreate = globalThis.document.createElement.bind(globalThis.document);
  globalThis.document.createElement = (tag) => {
    const el = origCreate(tag);
    if (tag === "input") {
      el.click = function() { fileInput = this; };
    }
    return el;
  };
  root.querySelector(".q-import").click();
  fileInput.files = [{ text: async () => "not valid json{" }];
  await fileInput.dispatchEvent(new globalThis.window.Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 20));
  assert.ok(alertMsg, "alertMsg should be set");
  assert.ok(alertMsg.includes("Import failed"));
});

test("sidebar: queue Import with no templates or queue in file shows error", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  let alertMsg = null;
  globalThis.window.alert = (m) => { alertMsg = m; };
  let fileInput = null;
  const origCreate = globalThis.document.createElement.bind(globalThis.document);
  globalThis.document.createElement = (tag) => {
    const el = origCreate(tag);
    if (tag === "input") {
      el.click = function() { fileInput = this; };
    }
    return el;
  };
  root.querySelector(".q-import").click();
  fileInput.files = [{ text: async () => JSON.stringify({}) }];
  await fileInput.dispatchEvent(new globalThis.window.Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 20));
  assert.ok(alertMsg, "alertMsg should be set");
  assert.ok(alertMsg.includes("Import failed"));
});

test("sidebar: destroy removes both asides", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  assert.ok(root.querySelector(".terminal-templates"));
  assert.ok(root.querySelector(".terminal-queue"));
  ctrl.destroy();
  assert.equal(root.querySelector(".terminal-templates"), null);
  assert.equal(root.querySelector(".terminal-queue"), null);
});

test("sidebar: destroy stops running queue", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  seedQueue([{ id: "a", text: "x", delayMs: 10000, status: "pending" }]);
  const root = globalThis.document.getElementById("root");
  let sendPromise = null;
  const ctrl = new TerminalSidebarController({
    rootEl: root, channelId: "test",
    send: () => new Promise(r => { sendPromise = r; }),
    isReady: () => true,
  });
  ctrl.mount();
  ctrl.queueRunner.start();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(ctrl.queueRunner.isRunning(), true, "queue should be running during send");
  ctrl.destroy();
  assert.equal(ctrl.queueRunner, null);
  if (sendPromise) sendPromise();
});

test("sidebar: _esc HTML-escapes special characters", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  assert.equal(ctrl._esc("<script>"), "&lt;script&gt;");
  assert.equal(ctrl._esc("&"), "&amp;");
  assert.equal(ctrl._esc("a>b"), "a&gt;b");
});

test("sidebar: queue item status rendered with status class", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  seedQueue([
    { id: "a", text: "x", delayMs: 0, status: "pending" },
    { id: "b", text: "y", delayMs: 0, status: "done" },
    { id: "c", text: "z", delayMs: 0, status: "failed", error: "bad" },
  ]);
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  const statuses = root.querySelectorAll(".q-item-status");
  assert.equal(statuses[0].className.includes("status-pending"), true);
  assert.equal(statuses[1].className.includes("status-done"), true);
  assert.equal(statuses[2].className.includes("status-failed"), true);
  assert.ok(statuses[2].textContent.includes("bad"));
});

test("sidebar: queue delay input disabled when queue running", async () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  seedQueue([{ id: "a", text: "x", delayMs: 10000, status: "pending" }]);
  const root = globalThis.document.getElementById("root");
  let sendPromise = null;
  const ctrl = new TerminalSidebarController({
    rootEl: root, channelId: "test",
    send: () => new Promise(r => { sendPromise = r; }),
    isReady: () => true,
  });
  ctrl.mount();
  ctrl.queueRunner.start();
  await new Promise(r => setTimeout(r, 20));
  const input = root.querySelector(".q-item-delay-input");
  assert.equal(input.disabled, true);
  ctrl.queueRunner.stop();
  if (sendPromise) sendPromise();
});

test("sidebar: queue itemFailed event logs error", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  seedQueue([{ id: "a", text: "x", delayMs: 0, status: "pending" }]);
  const root = globalThis.document.getElementById("root");
  const logs = [];
  const ctrl = new TerminalSidebarController({
    rootEl: root, channelId: "test", send: async () => {}, isReady: () => true,
    logger: { log: (s) => logs.push(s) },
  });
  ctrl.mount();
  ctrl.queueRunner._emit("itemFailed", { item: { text: "x" }, error: new Error("test-fail") });
  assert.ok(logs.some(l => l.includes("test-fail")));
});

test("sidebar: queue itemSent event pushes to history", () => {
  setupStore();
  clearHistory();
  makeDomAndStore("<div id='root'></div>");
  seedQueue([{ id: "a", text: "x", delayMs: 0, status: "pending" }]);
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  ctrl.queueRunner._emit("itemSent", { text: "sent-cmd", delayMs: 0, id: "a" });
  const raw = JSON.parse(_store["terminal:history"] ?? "[]");
  assert.ok(raw.includes("sent-cmd"));
  clearHistory();
});

test("sidebar: queue storage event triggers reload from localStorage", () => {
  setupStore();
  makeDomAndStore("<div id='root'></div>");
  seedQueue([{ id: "a", text: "first", delayMs: 0, status: "pending" }]);
  const root = globalThis.document.getElementById("root");
  const ctrl = new TerminalSidebarController({ rootEl: root, channelId: "test", send: async () => {}, isReady: () => true });
  ctrl.mount();
  assert.equal(ctrl.queueRunner.getItems().length, 1);
  assert.equal(ctrl.queueRunner.getItems()[0].text, "first");
  ctrl.queueRunner.setItems([{ id: "b", text: "external", delayMs: 50, status: "pending" }]);
  assert.equal(ctrl.queueRunner.getItems()[0].text, "external");
  const saved = JSON.parse(_store["terminal:queue"]);
  assert.equal(saved[0].text, "external");
});
