import test from "node:test";
import assert from "node:assert/strict";
import { mergeHexFiles } from "../../src/hex/multi-hex-merger.js";

function makeFile(name, entries) {
  return { name, parsed: { data: new Map(entries), addresses: entries.map(([a]) => a), byteCount: entries.length } };
}

test("mergeHexFiles single file passes through", () => {
  const f = makeFile("a.hex", [[0x1000, 0xaa], [0x1001, 0xbb]]);
  const { conflicts, merged } = mergeHexFiles([f]);
  assert.equal(conflicts.length, 0);
  assert.equal(merged.data.get(0x1000), 0xaa);
  assert.equal(merged.data.get(0x1001), 0xbb);
  assert.equal(merged.byteCount, 2);
});

test("mergeHexFiles two non-overlapping files merge cleanly", () => {
  const f1 = makeFile("a.hex", [[0x0000, 0x01], [0x0001, 0x02]]);
  const f2 = makeFile("b.hex", [[0x1000, 0x03], [0x1001, 0x04]]);
  const { conflicts, merged } = mergeHexFiles([f1, f2]);
  assert.equal(conflicts.length, 0);
  assert.equal(merged.data.size, 4);
  assert.equal(merged.data.get(0x0000), 0x01);
  assert.equal(merged.data.get(0x1000), 0x03);
});

test("mergeHexFiles detects conflicting byte values", () => {
  const f1 = makeFile("a.hex", [[0x2000, 0xaa]]);
  const f2 = makeFile("b.hex", [[0x2000, 0xbb]]);
  const { conflicts, merged } = mergeHexFiles([f1, f2]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].addr, 0x2000);
  assert.equal(conflicts[0].valueA, 0xaa);
  assert.equal(conflicts[0].valueB, 0xbb);
  // first file wins
  assert.equal(merged.data.get(0x2000), 0xaa);
});

test("mergeHexFiles same value at same address is not a conflict", () => {
  const f1 = makeFile("a.hex", [[0x100, 0xff]]);
  const f2 = makeFile("b.hex", [[0x100, 0xff]]);
  const { conflicts } = mergeHexFiles([f1, f2]);
  assert.equal(conflicts.length, 0);
});

test("mergeHexFiles empty files returns null merged", () => {
  const f = makeFile("empty.hex", []);
  const { merged } = mergeHexFiles([f]);
  assert.equal(merged, null);
});

test("mergeHexFiles addresses are sorted in merged result", () => {
  const f = makeFile("a.hex", [[0x3000, 0x01], [0x1000, 0x02], [0x2000, 0x03]]);
  const { merged } = mergeHexFiles([f]);
  const addrs = [...merged.data.keys()];
  assert.deepEqual(addrs, [0x1000, 0x2000, 0x3000]);
});
