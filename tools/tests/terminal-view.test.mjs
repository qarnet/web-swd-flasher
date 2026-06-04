import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { TerminalBuffer } from "../../src/ui/terminal-buffer.js";
import { TerminalView } from "../../src/ui/terminal-view.js";

async function flushPaint() {
  await new Promise(r => queueMicrotask(r));
}

function newBuffer(opts = {}) {
  return new TerminalBuffer({ channelId: "test", ...opts });
}

test("TerminalView: constructor - pre starts empty", async () => {
  makeDom(`<pre id="log"></pre>`);
  const pre = document.querySelector("#log");
  const b = newBuffer();
  new TerminalView({ buffer: b, rootEl: pre });
  assert.equal(pre.children.length, 0);
  teardownDom();
});

test("TerminalView: append one finalised line", async () => {
  makeDom(`<pre id="log"></pre>`);
  const pre = document.querySelector("#log");
  const b = newBuffer();
  new TerminalView({ buffer: b, rootEl: pre });
  b.appendString("hello\n");
  await flushPaint();
  assert.equal(pre.children.length, 1);
  const child = pre.children[0];
  assert.equal(child.className, "term-line");
  assert.equal(child.dataset.source, "rx");
  assert.ok(child.textContent.includes("hello"));
  teardownDom();
});

test("TerminalView: append chunk that leaves a pending line", async () => {
  makeDom(`<pre id="log"></pre>`);
  const pre = document.querySelector("#log");
  const b = newBuffer();
  new TerminalView({ buffer: b, rootEl: pre });
  b.appendString("hello");
  await flushPaint();
  assert.equal(pre.children.length, 1);
  const child = pre.children[0];
  assert.equal(child.className, "term-line term-line-pending");
  assert.ok(child.textContent.includes("hello"));
  teardownDom();
});

test("TerminalView: pending becomes finalised on newline", async () => {
  makeDom(`<pre id="log"></pre>`);
  const pre = document.querySelector("#log");
  const b = newBuffer();
  new TerminalView({ buffer: b, rootEl: pre });
  b.appendString("world\n");
  await flushPaint();
  assert.equal(pre.children.length, 1);
  assert.equal(pre.children[0].className, "term-line");
  assert.ok(pre.children[0].textContent.includes("world"));
  teardownDom();
});

test("TerminalView: pending replaced by finalised then new pending", async () => {
  makeDom(`<pre id="log"></pre>`);
  const pre = document.querySelector("#log");
  const b = newBuffer();
  new TerminalView({ buffer: b, rootEl: pre });
  b.appendString("first\nsecond");
  await flushPaint();
  const children = pre.children;
  assert.equal(children.length, 2);
  assert.equal(children[0].className, "term-line");
  assert.equal(children[1].className, "term-line term-line-pending");
  assert.ok(children[0].textContent.includes("first"));
  assert.ok(children[1].textContent.includes("second"));
  teardownDom();
});

test("TerminalView: ring drop - DOM has maxLines children", async () => {
  makeDom(`<pre id="log"></pre>`);
  const pre = document.querySelector("#log");
  const b = newBuffer({ maxLines: 5 });
  new TerminalView({ buffer: b, rootEl: pre });
  for (let i = 0; i < 10; i++) b.appendString(`line${i}\n`);
  await flushPaint();
  assert.equal(pre.children.length, 5);
  assert.ok(pre.children[0].textContent.includes("line5"));
  teardownDom();
});

test("TerminalView: ring drop removes head children", async () => {
  makeDom(`<pre id="log"></pre>`);
  const pre = document.querySelector("#log");
  const b = newBuffer({ maxLines: 3 });
  new TerminalView({ buffer: b, rootEl: pre });
  b.appendString("a\nb\nc\nd\ne\n");
  await flushPaint();
  assert.equal(pre.children.length, 3);
  assert.ok(pre.children[0].textContent.includes("c"));
  assert.ok(pre.children[2].textContent.includes("e"));
  teardownDom();
});

test("TerminalView: styled run renders as span with inline style", async () => {
  makeDom(`<pre id="log"></pre>`);
  const pre = document.querySelector("#log");
  const b = newBuffer();
  new TerminalView({ buffer: b, rootEl: pre });
  b.appendString("\x1b[31mred\n");
  await flushPaint();
  const line = pre.children[0];
  const span = line.querySelector("span");
  assert.ok(span, "should have styled span");
  assert.ok(span.getAttribute("style").includes("color"), "should have color style");
  assert.equal(span.textContent, "red");
  teardownDom();
});

test("TerminalView: plain run renders as text node", async () => {
  makeDom(`<pre id="log"></pre>`);
  const pre = document.querySelector("#log");
  const b = newBuffer();
  new TerminalView({ buffer: b, rootEl: pre });
  b.appendString("plain\n");
  await flushPaint();
  const line = pre.children[0];
  assert.equal(line.childNodes.length, 1);
  assert.equal(line.childNodes[0].nodeType, 3); // text node
  assert.equal(line.textContent, "plain");
  teardownDom();
});

test("TerminalView: bold and dim style", async () => {
  makeDom(`<pre id="log"></pre>`);
  const pre = document.querySelector("#log");
  const b = newBuffer();
  new TerminalView({ buffer: b, rootEl: pre });
  b.appendString("\x1b[1mbold\x1b[22m\x1b[2mdim\n");
  await flushPaint();
  const line = pre.children[0];
  const spans = line.querySelectorAll("span");
  assert.ok(spans.length >= 2);
  teardownDom();
});

test("TerminalView: setAutoScroll(false) prevents scroll", async () => {
  makeDom(`<pre id="log" style="height:50px;overflow:auto;"></pre>`);
  const pre = document.querySelector("#log");
  const b = newBuffer();
  const v = new TerminalView({ buffer: b, rootEl: pre, autoScroll: false });
  Object.defineProperty(pre, "scrollTop", { value: 0, writable: true });
  Object.defineProperty(pre, "scrollHeight", { value: 1000, writable: true });
  for (let i = 0; i < 20; i++) b.appendString(`line${i}\n`);
  await flushPaint();
  assert.equal(pre.scrollTop, 0);
  teardownDom();
});

test("TerminalView: clear() empties DOM", async () => {
  makeDom(`<pre id="log"></pre>`);
  const pre = document.querySelector("#log");
  const b = newBuffer();
  new TerminalView({ buffer: b, rootEl: pre });
  b.appendString("hello\nworld\n");
  await flushPaint();
  assert.equal(pre.children.length, 2);
  b.clear();
  await flushPaint();
  assert.equal(pre.children.length, 0);
  teardownDom();
});

test("TerminalView: destroy() unsubscribes and empties DOM", async () => {
  makeDom(`<pre id="log"></pre>`);
  const pre = document.querySelector("#log");
  const b = newBuffer();
  const v = new TerminalView({ buffer: b, rootEl: pre });
  b.appendString("hello\n");
  await flushPaint();
  assert.equal(pre.children.length, 1);
  v.destroy();
  assert.equal(pre.children.length, 0);
  b.appendString("world\n");
  await flushPaint();
  assert.equal(pre.children.length, 0, "DOM should not update after destroy");
  teardownDom();
});

test("TerminalView: source tagging - tx line gets data-source=tx", async () => {
  makeDom(`<pre id="log"></pre>`);
  const pre = document.querySelector("#log");
  const b = newBuffer();
  new TerminalView({ buffer: b, rootEl: pre });
  b.appendString("tx line", { source: "tx" });
  b.appendString("\n");
  await flushPaint();
  const child = pre.children[0];
  assert.equal(child.dataset.source, "tx");
  teardownDom();
});

test("TerminalView: multiple appends coalesced in one paint", async () => {
  makeDom(`<pre id="log"></pre>`);
  const pre = document.querySelector("#log");
  const b = newBuffer();
  new TerminalView({ buffer: b, rootEl: pre });
  b.appendString("a\n");
  b.appendString("b\n");
  b.appendString("c\n");
  await flushPaint();
  assert.equal(pre.children.length, 3);
  teardownDom();
});

test("TerminalView: both rx and tx lines in same view", async () => {
  makeDom(`<pre id="log"></pre>`);
  const pre = document.querySelector("#log");
  const b = newBuffer();
  new TerminalView({ buffer: b, rootEl: pre });
  b.appendString("rx data\n");
  b.appendString("tx data", { source: "tx" });
  b.appendString("\n");
  await flushPaint();
  const children = pre.children;
  assert.equal(children.length, 2);
  assert.equal(children[0].dataset.source, "rx");
  assert.equal(children[1].dataset.source, "tx");
  teardownDom();
});
