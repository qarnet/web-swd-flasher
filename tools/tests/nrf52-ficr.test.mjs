import test from "node:test";
import assert from "node:assert/strict";
import { parseNrf52Ficr } from "../../src/nrf/nrf52-ficr.js";

test("parses nrf52 ficr snapshot fields", () => {
  const sample = new Uint8Array(0x200);
  sample.set([0x40, 0x28, 0x05, 0x00], 0x100);
  sample.set([0x41, 0x41, 0x41, 0x41], 0x104);
  sample.set([0x00, 0x20, 0x00, 0x00], 0x108);
  sample.set([0x00, 0x01, 0x00, 0x00], 0x10c);
  sample.set([0x00, 0x04, 0x00, 0x00], 0x110);
  const info = parseNrf52Ficr(sample);
  assert.equal(info.part, 0x00052840);
  assert.equal(info.variant, 0x41414141);
  assert.equal(info.package, 0x2000);
  assert.equal(info.ram, 256);
  assert.equal(info.flash, 1024);
});
