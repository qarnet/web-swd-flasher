import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import * as logger from "../../src/ui/logger.js";

function makeLoggerDom(opts = {}) {
  const { hasCheckbox = true, hasLog = true, hasStatus = true, hasLed = true, hasTopbar = true } = opts;
  const parts = [];
  if (hasStatus) parts.push(`<div id='status'></div>`);
  if (hasLog) parts.push(`<pre id='log'></pre>`);
  if (hasLed) parts.push(`<span id='status-led'></span>`);
  if (hasTopbar) parts.push(`<span id='topbar-target'></span>`);
  if (hasCheckbox) parts.push(`<input type='checkbox' id='chk-verbose' />`);
  makeDom(parts.join(""));
  const elements = {};
  if (hasStatus) elements.statusEl = globalThis.document.getElementById("status");
  if (hasLog) elements.logEl = globalThis.document.getElementById("log");
  if (hasLed) elements.statusLed = globalThis.document.getElementById("status-led");
  if (hasTopbar) elements.topbarTarget = globalThis.document.getElementById("topbar-target");
  if (hasCheckbox) elements.chkVerbose = globalThis.document.getElementById("chk-verbose");
  return elements;
}

test("logger: init stores statusEl, logEl, statusLed, topbarTarget", () => {
  const elements = makeLoggerDom();
  logger.init(elements);
  assert.ok(elements.statusEl);
  assert.ok(elements.logEl);
  assert.ok(elements.statusLed);
  assert.ok(elements.topbarTarget);
});

test("logger: init without chkVerbose does not crash", () => {
  const elements = makeLoggerDom({ hasCheckbox: false });
  assert.doesNotThrow(() => logger.init(elements));
});

test("logger: init without logEl does not crash", () => {
  const elements = makeLoggerDom({ hasLog: false });
  assert.doesNotThrow(() => logger.init(elements));
});

test("logger: log() updates logEl.textContent with timestamped line", () => {
  const elements = makeLoggerDom();
  logger.init(elements);
  logger.setVerbose(false);
  logger.log("hello");
  const text = elements.logEl.textContent;
  assert.ok(text.includes("hello"), `expected 'hello' in: ${text}`);
  assert.ok(/\[\d{4}-/.test(text), `expected ISO timestamp prefix in: ${text}`);
});

test("logger: logVerbose does NOT log when verbose is false", () => {
  const elements = makeLoggerDom();
  logger.init(elements);
  logger.setVerbose(false);
  logger.logVerbose("secret");
  assert.equal(elements.logEl.textContent.includes("secret"), false);
});

test("logger: logVerbose logs when verbose is true", () => {
  const elements = makeLoggerDom();
  logger.init(elements);
  logger.setVerbose(true);
  logger.logVerbose("loud");
  assert.equal(elements.logEl.textContent.includes("loud"), true);
});

test("logger: setVerbose(true)/setVerbose(false) toggles state", () => {
  const elements = makeLoggerDom();
  logger.init(elements);
  logger.setVerbose(true);
  assert.equal(logger.isVerbose(), true);
  logger.setVerbose(false);
  assert.equal(logger.isVerbose(), false);
});

test("logger: setVerbose coerces truthy", () => {
  const elements = makeLoggerDom();
  logger.init(elements);
  logger.setVerbose(1);
  assert.equal(logger.isVerbose(), true);
  logger.setVerbose(0);
  assert.equal(logger.isVerbose(), false);
});

test("logger: setStatus updates statusEl and logs message", () => {
  const elements = makeLoggerDom();
  logger.init(elements);
  logger.setStatus("Connected");
  assert.equal(elements.statusEl.textContent, "Connected");
  assert.ok(elements.logEl.textContent.includes("Connected"));
});

test("logger: setLed(true) adds 'on' class", () => {
  const elements = makeLoggerDom();
  logger.init(elements);
  logger.setLed(true);
  assert.equal(elements.statusLed.classList.contains("on"), true);
});

test("logger: setLed(false) removes 'on' class", () => {
  const elements = makeLoggerDom();
  logger.init(elements);
  logger.setLed(true);
  logger.setLed(false);
  assert.equal(elements.statusLed.classList.contains("on"), false);
});

test("logger: setTopbarTarget updates topbarTarget text", () => {
  const elements = makeLoggerDom();
  logger.init(elements);
  logger.setTopbarTarget("nRF52840");
  assert.equal(elements.topbarTarget.textContent, "nRF52840");
});

test("logger: clearLog empties logEl and resets buffer", () => {
  const elements = makeLoggerDom();
  logger.init(elements);
  logger.setVerbose(false);
  logger.log("first");
  logger.log("second");
  assert.ok(elements.logEl.textContent.includes("first"));
  logger.clearLog();
  assert.equal(elements.logEl.textContent, "");
});

test("logger: downloadLogContent calls downloadLog with joined content", () => {
  const elements = makeLoggerDom();
  logger.init(elements);
  logger.setVerbose(false);
  logger.log("line1");
  logger.log("line2");
  let downloadedText = null;
  let downloadedFilename = null;
  globalThis.Blob = class { constructor(parts) { this.parts = parts; this.text = parts.join(""); } };
  globalThis.URL.createObjectURL = (blob) => { downloadedText = blob.text; return "blob:fake"; };
  globalThis.URL.revokeObjectURL = () => {};
  let clicked = null;
  const origCreate = globalThis.document.createElement.bind(globalThis.document);
  globalThis.document.createElement = (tag) => {
    const el = origCreate(tag);
    if (tag === "a") {
      el.click = function() { clicked = this; };
    }
    return el;
  };
  logger.downloadLogContent();
  assert.ok(downloadedText.includes("line1"));
  assert.ok(downloadedText.includes("line2"));
  assert.ok(clicked);
  assert.ok(clicked.download.startsWith("event-log-"));
});

test("logger: 5000-line buffer cap (oldest lines trimmed)", () => {
  const elements = makeLoggerDom();
  logger.init(elements);
  logger.setVerbose(false);
  for (let i = 0; i < 5010; i++) logger.log(`line-${i}`);
  const text = elements.logEl.textContent;
  assert.equal(text.includes("line-0"), false, "oldest lines should be trimmed");
  assert.equal(text.includes("line-5009"), true, "newest lines should remain");
});
