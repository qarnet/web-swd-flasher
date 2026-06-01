import test from "node:test";
import assert from "node:assert/strict";
import { buildImageMap, formatImageMap } from "../../src/hex/image-map.js";

function makeParsed(addresses, byteCount, minAddr, maxAddr) {
  return {
    addresses: addresses.sort((a, b) => a - b),
    byteCount: byteCount ?? addresses.length,
    minAddress: minAddr ?? Math.min(...addresses),
    maxAddress: maxAddr ?? Math.max(...addresses),
    data: new Map()
  };
}

test("buildImageMap creates single segment from contiguous addresses", () => {
  const parsed = makeParsed([0x1000, 0x1001, 0x1002, 0x1003]);
  const map = buildImageMap(parsed);
  assert.equal(map.segments.length, 1);
  assert.equal(map.segments[0].start, 0x1000);
  assert.equal(map.segments[0].end, 0x1003);
  assert.equal(map.segments[0].length, 4);
});

test("buildImageMap creates two segments from gap addresses", () => {
  const parsed = makeParsed([0x1000, 0x1001, 0x2000, 0x2001]);
  const map = buildImageMap(parsed);
  assert.equal(map.segments.length, 2);
  assert.equal(map.segments[0].start, 0x1000);
  assert.equal(map.segments[0].end, 0x1001);
  assert.equal(map.segments[1].start, 0x2000);
  assert.equal(map.segments[1].end, 0x2001);
});

test("buildImageMap with single byte", () => {
  const parsed = makeParsed([0x26000]);
  const map = buildImageMap(parsed);
  assert.equal(map.segments.length, 1);
  assert.equal(map.segments[0].start, 0x26000);
  assert.equal(map.segments[0].end, 0x26000);
  assert.equal(map.segments[0].length, 1);
});

test("buildImageMap with empty addresses", () => {
  const parsed = makeParsed([]);
  const map = buildImageMap(parsed);
  assert.equal(map.segments.length, 0);
});

test("formatImageMap produces readable output", () => {
  const parsed = makeParsed([0x1000, 0x1001, 0x1002]);
  const map = buildImageMap(parsed);
  const text = formatImageMap(map);
  assert.ok(text.includes("Bytes:"));
  assert.ok(text.includes("Segments:"));
  assert.ok(text.includes("0x"));
});