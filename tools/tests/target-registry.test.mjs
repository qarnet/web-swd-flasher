import test from "node:test";
import assert from "node:assert/strict";
import { TARGETS, detectTarget } from "../../src/targets/target-registry.js";

// Build a fake FICR block matching a specific part number.
// FICR layout at 0x10000100 (offset 0x00 in the block):
//   +0x00: INFO.PART (nRF part number in hex, e.g. 0x52840)
//   +0x04: INFO.VARIANT
//   +0x08: INFO.PACKAGE
//   +0x0C: INFO.RAM
//   +0x10: INFO.FLASH
function buildFicrBlock(partId) {
  const buf = new ArrayBuffer(0x14);
  const view = new DataView(buf);
  view.setUint32(0x00, partId, true);
  view.setUint32(0x04, 0xAABB0000, true); // VARIANT
  view.setUint32(0x08, 0x2009, true);      // PACKAGE (QI)
  view.setUint32(0x0c, 256, true);         // RAM KB
  view.setUint32(0x10, 1024, true);        // FLASH KB
  return new Uint8Array(buf);
}

class FakeAdi {
  constructor(ficrBlock) {
    this._ficr = ficrBlock;
  }
  async readMemBlock(addr, len) {
    return this._ficr.slice(0, len);
  }
}

class FakeAdiFail {
  async readMemBlock() { throw new Error("read fail"); }
}

test("TARGETS contains expected IDs", () => {
  const ids = TARGETS.map((t) => t.id);
  assert.ok(ids.includes("nrf52840"));
  assert.ok(ids.includes("nrf52832"));
  assert.ok(ids.includes("nrf52833"));
  assert.ok(ids.includes("nrf5340-app"));
  assert.ok(ids.includes("generic"));
});

test("detectTarget identifies nRF52840", async () => {
  const adi = new FakeAdi(buildFicrBlock(0x52840));
  const { target, ficr } = await detectTarget(adi);
  assert.equal(target.id, "nrf52840");
  assert.equal(ficr.part, 0x52840);
});

test("detectTarget identifies nRF52832", async () => {
  const adi = new FakeAdi(buildFicrBlock(0x52832));
  const { target } = await detectTarget(adi);
  assert.equal(target.id, "nrf52832");
});

test("detectTarget falls back to generic for unknown part", async () => {
  const adi = new FakeAdi(buildFicrBlock(0x12345));
  const { target } = await detectTarget(adi);
  assert.equal(target.id, "generic");
});

test("detectTarget falls back to generic when FICR unreadable", async () => {
  const adi = new FakeAdiFail();
  const { target, ficr } = await detectTarget(adi);
  assert.equal(target.id, "generic");
  assert.equal(ficr, null);
});

test("nRF52840 target has correct flash and RAM params", () => {
  const t = TARGETS.find((t) => t.id === "nrf52840");
  assert.equal(t.flash.size, 1024 * 1024);
  assert.equal(t.flash.pageSize, 4096);
  assert.equal(t.ram.size, 256 * 1024);
  assert.equal(t.hasCtrlAp, true);
});
