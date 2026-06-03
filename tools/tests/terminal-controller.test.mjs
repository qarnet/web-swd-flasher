import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { TerminalBuffer } from "../../src/ui/terminal-buffer.js";
import { TerminalView } from "../../src/ui/terminal-view.js";
import { TerminalController } from "../../src/ui/components/terminal-controller.js";
import { clearHistory, getHistory } from "../../src/ui/components/terminal-history-store.js";

async function flushPaint() {
  await new Promise(r => queueMicrotask(r));
}

test("TerminalController: send on button click", async () => {
  makeDom(`<div id="root"><pre id="test-log"></pre><input id="test-input"><button id="btn-send"></button><input id="chk-test-echo" type="checkbox" checked></div>`);
  const sendCalled = [];
  const b = new TerminalBuffer({ channelId: "test" });
  const v = new TerminalView({ buffer: b, rootEl: document.querySelector("#test-log") });
  const c = new TerminalController({
    root: document.querySelector("#root"),
    inputEl: document.querySelector("#test-input"),
    sendBtnEl: document.querySelector("#btn-send"),
    buffer: b,
    view: v,
    channelId: "test",
    send: async (text) => { sendCalled.push(text); },
    isReady: () => true,
    logger: { log: () => {} },
  });
  document.querySelector("#test-input").value = "clicked";
  document.querySelector("#btn-send").click();
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(sendCalled, ["clicked"]);
  assert.equal(document.querySelector("#test-input").value, "");
  c.destroy();
  v.destroy();
  teardownDom();
});

test("TerminalController: not ready disables send button", async () => {
  makeDom(`<div id="root"><pre id="test-log"></pre><input id="test-input"><button id="btn-send"></button><input id="chk-test-echo" type="checkbox" checked></div>`);
  const sendCalled = [];
  const b = new TerminalBuffer({ channelId: "test" });
  const v = new TerminalView({ buffer: b, rootEl: document.querySelector("#test-log") });
  const c = new TerminalController({
    root: document.querySelector("#root"),
    inputEl: document.querySelector("#test-input"),
    sendBtnEl: document.querySelector("#btn-send"),
    buffer: b,
    view: v,
    channelId: "test",
    send: async (text) => { sendCalled.push(text); },
    isReady: () => false,
    logger: { log: () => {} },
  });
  document.querySelector("#test-input").value = "test";
  document.querySelector("#btn-send").click();
  assert.deepEqual(sendCalled, []);
  c.destroy();
  v.destroy();
  teardownDom();
});

test("TerminalController: echo inserts tx line into buffer", async () => {
  makeDom(`<div id="root"><pre id="test-log"></pre><input id="test-input"><button id="btn-send"></button><input id="chk-test-echo" type="checkbox" checked></div>`);
  const b = new TerminalBuffer({ channelId: "test" });
  const v = new TerminalView({ buffer: b, rootEl: document.querySelector("#test-log") });
  const c = new TerminalController({
    root: document.querySelector("#root"),
    inputEl: document.querySelector("#test-input"),
    sendBtnEl: document.querySelector("#btn-send"),
    buffer: b,
    view: v,
    channelId: "test",
    send: async () => {},
    isReady: () => true,
    logger: { log: () => {} },
  });
  document.querySelector("#test-input").value = "hello";
  document.querySelector("#btn-send").click();
  await new Promise(r => setTimeout(r, 10));
  await flushPaint();
  const txLines = b.lines.filter(l => l.source === "tx");
  assert.ok(txLines.length >= 1, "should have at least one tx line");
  assert.ok(txLines[0].runs.map(r => r.text).join("").includes("hello"));
  c.destroy();
  v.destroy();
  teardownDom();
});

test("TerminalController: echo off does not add tx line", async () => {
  makeDom(`<div id="root"><pre id="test-log"></pre><input id="test-input"><button id="btn-send"></button><input id="chk-test-echo" type="checkbox"></div>`);
  localStorage.setItem("terminal:echo:test", "false");
  const b = new TerminalBuffer({ channelId: "test" });
  const v = new TerminalView({ buffer: b, rootEl: document.querySelector("#test-log") });
  const c = new TerminalController({
    root: document.querySelector("#root"),
    inputEl: document.querySelector("#test-input"),
    sendBtnEl: document.querySelector("#btn-send"),
    buffer: b,
    view: v,
    channelId: "test",
    send: async () => {},
    isReady: () => true,
    logger: { log: () => {} },
  });
  document.querySelector("#test-input").value = "hello";
  document.querySelector("#btn-send").click();
  await new Promise(r => setTimeout(r, 10));
  await flushPaint();
  assert.ok(b.lines.every(l => l.source !== "tx"), "no tx lines when echo off");
  c.destroy();
  v.destroy();
  teardownDom();
});

test("TerminalController: search bar elements present", () => {
  makeDom(`<div id="root"><pre id="test-log"></pre><input id="test-input"><button id="btn-send"></button><input id="chk-test-echo" type="checkbox" checked></div>`);
  const b = new TerminalBuffer({ channelId: "test" });
  const v = new TerminalView({ buffer: b, rootEl: document.querySelector("#test-log") });
  const c = new TerminalController({
    root: document.querySelector("#root"),
    inputEl: document.querySelector("#test-input"),
    sendBtnEl: document.querySelector("#btn-send"),
    buffer: b,
    view: v,
    channelId: "test",
    send: async () => {},
    isReady: () => true,
    logger: { log: () => {} },
  });
  const root = document.querySelector("#root");
  assert.ok(root.querySelector(".terminal-search"), "should have search bar");
  assert.ok(root.querySelector(".terminal-templates"), "should have template sidebar");
  assert.ok(root.querySelector(".terminal-queue"), "should have queue sidebar");
  assert.ok(root.querySelector(".search-query"), "should have query input");
  c.destroy();
  v.destroy();
  teardownDom();
});

test("TerminalController: destroy cleans up DOM", () => {
  makeDom(`<div id="root"><pre id="test-log"></pre><input id="test-input"><button id="btn-send"></button><input id="chk-test-echo" type="checkbox" checked></div>`);
  const b = new TerminalBuffer({ channelId: "test" });
  const v = new TerminalView({ buffer: b, rootEl: document.querySelector("#test-log") });
  const c = new TerminalController({
    root: document.querySelector("#root"),
    inputEl: document.querySelector("#test-input"),
    sendBtnEl: document.querySelector("#btn-send"),
    buffer: b,
    view: v,
    channelId: "test",
    send: async () => {},
    isReady: () => true,
    logger: { log: () => {} },
  });
  c.destroy();
  v.destroy();
  const root = document.querySelector("#root");
  assert.equal(root.querySelector(".terminal-templates"), null);
  assert.equal(root.querySelector(".terminal-queue"), null);
  assert.ok(root.querySelector("#test-log"), "log element should be restored");
  teardownDom();
});

test("TerminalController: queue sidebar has send/stop/clear buttons", () => {
  makeDom(`<div id="root"><pre id="test-log"></pre><input id="test-input"><button id="btn-send"></button><input id="chk-test-echo" type="checkbox" checked></div>`);
  const b = new TerminalBuffer({ channelId: "test" });
  const v = new TerminalView({ buffer: b, rootEl: document.querySelector("#test-log") });
  const c = new TerminalController({
    root: document.querySelector("#root"),
    inputEl: document.querySelector("#test-input"),
    sendBtnEl: document.querySelector("#btn-send"),
    buffer: b,
    view: v,
    channelId: "test",
    send: async () => {},
    isReady: () => true,
    logger: { log: () => {} },
  });
  const queue = document.querySelector("#root .terminal-queue");
  assert.ok(queue.querySelector(".q-send-queue"), "should have send queue button");
  assert.ok(queue.querySelector(".q-stop-queue"), "should have stop button");
  assert.ok(queue.querySelector(".q-clear-queue"), "should have clear button");
  c.destroy();
  v.destroy();
  teardownDom();
});

test("TerminalController: template sidebar has new template button", () => {
  makeDom(`<div id="root"><pre id="test-log"></pre><input id="test-input"><button id="btn-send"></button><input id="chk-test-echo" type="checkbox" checked></div>`);
  const b = new TerminalBuffer({ channelId: "test" });
  const v = new TerminalView({ buffer: b, rootEl: document.querySelector("#test-log") });
  const c = new TerminalController({
    root: document.querySelector("#root"),
    inputEl: document.querySelector("#test-input"),
    sendBtnEl: document.querySelector("#btn-send"),
    buffer: b,
    view: v,
    channelId: "test",
    send: async () => {},
    isReady: () => true,
    logger: { log: () => {} },
  });
  const templates = document.querySelector("#root .terminal-templates");
  assert.ok(templates.querySelector(".template-new"), "should have new template button");
  c.destroy();
  v.destroy();
  teardownDom();
});

test("TerminalController: send clears input", async () => {
  makeDom(`<div id="root"><pre id="test-log"></pre><input id="test-input"><button id="btn-send"></button><input id="chk-test-echo" type="checkbox" checked></div>`);
  const b = new TerminalBuffer({ channelId: "test" });
  const v = new TerminalView({ buffer: b, rootEl: document.querySelector("#test-log") });
  const c = new TerminalController({
    root: document.querySelector("#root"),
    inputEl: document.querySelector("#test-input"),
    sendBtnEl: document.querySelector("#btn-send"),
    buffer: b,
    view: v,
    channelId: "test",
    send: async () => {},
    isReady: () => true,
    logger: { log: () => {} },
  });
  document.querySelector("#test-input").value = "clear-me";
  document.querySelector("#btn-send").click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(document.querySelector("#test-input").value, "");
  c.destroy();
  v.destroy();
  teardownDom();
});
