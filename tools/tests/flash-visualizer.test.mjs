import test from "node:test";
import assert from "node:assert/strict";
import { renderFlashVisualizer } from "../../src/ui/flash-visualizer.js";

test("visualizer renders SVG with named regions", () => {
  const container = { innerHTML: "" };
  renderFlashVisualizer(container, {
    flashStart: 0x00000000,
    flashSize: 1024 * 1024,
    targetId: "nrf52840",
    namedRegions: [{ label: "MBR", start: 0x000000, end: 0x000fff, color: "#6b7280" }, { label: "BL", start: 0x001000, end: 0x025fff, color: "#9ca3af" }],
    files: [{ name: "test", color: "#ff0000", segments: [{ start: 0x00026000, end: 0x00027000, length: 4097 }] }],
    readRegions: [{ start: 0x00026000, size: 4096, ok: true }],
  });
  const svg = container.innerHTML;
  assert.ok(svg.includes("<svg"), "should output SVG");
  assert.ok(svg.includes("MBR"), "should include named region label");
  assert.ok(svg.includes("BL"), "should include bootloader label");
  assert.ok(svg.includes("Read"), "should include read region");
  assert.ok(svg.includes("test"), "should include file name");
});

test("visualizer handles empty namedRegions gracefully", () => {
  const container = { innerHTML: "" };
  renderFlashVisualizer(container, {
    flashStart: 0, flashSize: 512 * 1024,
    namedRegions: [],
    files: [],
    readRegions: [],
  });
  assert.ok(container.innerHTML.includes("<svg"), "should still produce SVG");
});

test("visualizer handles off-flash segments", () => {
  const container = { innerHTML: "" };
  renderFlashVisualizer(container, {
    flashStart: 0x00000000,
    flashSize: 1024 * 1024,
    namedRegions: [{ label: "MBR", start: 0, end: 0xfff, color: "#6b7280" }],
    files: [{ name: "bad", color: "#f00", segments: [{ start: 0xFFFFF000, end: 0xFFFFFFFF, length: 4096 }] }],
    readRegions: [{ start: 0x20000000, size: 256, ok: false }],
  });
  const svg = container.innerHTML;
  assert.ok(svg.includes("#fecaca"), "should render read-error region (red)");
  assert.ok(svg.includes("#bbf7d0") === false, "should not render ok region");
});
