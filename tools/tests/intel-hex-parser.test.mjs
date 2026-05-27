import test from "node:test";
import assert from "node:assert/strict";
import { parseIntelHexFileText } from "../../src/hex/intel-hex-parser.js";
import { buildImageMap } from "../../src/hex/image-map.js";
import { validateAppRange } from "../../src/nrf/nrf52-memory-map.js";

test("parses minimal valid intel hex", () => {
  const hex = [":020000040002F8", ":040000001122334452", ":00000001FF"].join("\n");
  const parsed = parseIntelHexFileText(hex);
  assert.equal(parsed.byteCount, 4);
  assert.equal(parsed.minAddress, 0x00020000);
  assert.equal(parsed.maxAddress, 0x00020003);
});

test("rejects bad checksum", () => {
  const hex = [":020000040002F7", ":00000001FF"].join("\n");
  assert.throws(() => parseIntelHexFileText(hex), /checksum mismatch/);
});

test("builds segments and enforces app flash range", () => {
  const hex = [":020000040002F8", ":040000001122334452", ":00000001FF"].join("\n");
  const parsed = parseIntelHexFileText(hex);
  const map = buildImageMap(parsed);
  const policy = validateAppRange(map);
  assert.equal(map.segments.length, 1);
  assert.equal(policy.ok, false);
});
