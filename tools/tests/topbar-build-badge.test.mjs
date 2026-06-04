import test from "node:test";
import assert from "node:assert/strict";
import { renderBuildTimestamp } from "../../src/ui/components/topbar-build-badge.js";

test("renderBuildTimestamp renders valid ISO timestamp", () => {
  const el = { textContent: "" };
  renderBuildTimestamp(el, "2025-06-01T12:00:00Z");
  assert.ok(el.textContent.startsWith("Build "));
  assert.ok(!el.textContent.includes("Invalid"));
});

test("renderBuildTimestamp no-ops for placeholder", () => {
  const el = { textContent: "original" };
  renderBuildTimestamp(el, "__BUILD_TIMESTAMP__");
  assert.equal(el.textContent, "original");
});

test("renderBuildTimestamp no-ops for null timestamp", () => {
  const el = { textContent: "original" };
  renderBuildTimestamp(el, null);
  assert.equal(el.textContent, "original");
});

test("renderBuildTimestamp no-ops for missing el", () => {
  renderBuildTimestamp(null, "2025-06-01T12:00:00Z");
});
