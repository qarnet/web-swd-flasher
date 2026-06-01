import test from "node:test";
import assert from "node:assert/strict";
import { createPanelLogger } from "../../src/ui/components/panel-logger.js";

test("createPanelLogger returns log/clearLog/downloadLogContent", () => {
  const el = { textContent: "" };
  const logger = createPanelLogger(el);
  assert.equal(typeof logger.log, "function");
  assert.equal(typeof logger.clearLog, "function");
  assert.equal(typeof logger.downloadLogContent, "function");
});

test("createPanelLogger.log appends to element", () => {
  const el = { textContent: "" };
  const logger = createPanelLogger(el);
  logger.log("hello");
  assert.ok(el.textContent.includes("hello"));
  assert.ok(el.textContent.includes("["));
});

test("createPanelLogger.clearLog empties element and lines", () => {
  const el = { textContent: "" };
  const logger = createPanelLogger(el);
  logger.log("msg1");
  logger.clearLog();
  assert.equal(el.textContent, "");
  assert.equal(logger.lines.length, 0);
});

test("createPanelLogger lines accumulate in order", () => {
  const el = { textContent: "" };
  const logger = createPanelLogger(el);
  logger.log("first");
  logger.log("second");
  assert.equal(logger.lines.length, 2);
  assert.ok(logger.lines[0].includes("first"));
  assert.ok(logger.lines[1].includes("second"));
});

test("createPanelLogger uses pre.log child if present", () => {
  const logEl = { textContent: "" };
  const rootEl = {
    querySelector: (sel) => sel === "pre.log" ? logEl : null,
  };
  const logger = createPanelLogger(rootEl);
  logger.log("test");
  assert.ok(logEl.textContent.includes("test"));
});
