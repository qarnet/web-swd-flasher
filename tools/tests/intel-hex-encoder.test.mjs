import test from "node:test";
import assert from "node:assert/strict";
import { buildIntelHex } from "../../src/hex/intel-hex-encoder.js";
import { parseIntelHexFileText } from "../../src/hex/intel-hex-parser.js";

test("buildIntelHex round-trips through parser", () => {
  const bytes = new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
  const hexText = buildIntelHex(0x00001000, bytes);
  assert.ok(hexText.startsWith(":"), "output should start with Intel HEX colon");
  assert.ok(hexText.endsWith("\r\n"), "output should end with CRLF");

  const parsed = parseIntelHexFileText(hexText);
  assert.equal(parsed.byteCount, 16);
  for (let i = 0; i < 16; i++) {
    assert.equal(parsed.data.get(0x1000 + i), bytes[i], `mismatch at offset ${i}`);
  }
});

test("buildIntelHex for zero bytes", () => {
  const hexText = buildIntelHex(0x0, new Uint8Array(0));
  assert.ok(hexText.includes(":00000001FF"), "should include EOF record");
});

test("buildIntelHex crosses 64KB boundary", () => {
  const bytes = new Uint8Array(256);
  bytes.fill(0xAB);
  const hexText = buildIntelHex(0x0000FF00, bytes);
  const lines = hexText.split("\r\n");
  const extLinAddrCount = lines.filter(l => l.startsWith(":02000004")).length;
  assert.ok(extLinAddrCount > 0, "should emit extended linear address records");
});

test("buildIntelHex checksum is verified by parser", () => {
  const bytes = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
  const hexText = buildIntelHex(0x20000000, bytes);
  const parsed = parseIntelHexFileText(hexText);
  assert.equal(parsed.data.get(0x20000000), 0xDE);
  assert.equal(parsed.data.get(0x20000003), 0xEF);
});
