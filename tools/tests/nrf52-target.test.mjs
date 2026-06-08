import test from "node:test";
import assert from "node:assert/strict";
import { Nrf52Target } from "../../src/backends/cmsis-dap/nrf52-target.js";
import { parseNrf52Ficr } from "../../src/nrf/nrf52-ficr.js";

class FakeAdi {
  constructor({ dpidr = 0x0bc10477, ficrSnapshot = null, ficrThrows = false } = {}) {
    this._dpidr = dpidr;
    this._ficrSnapshot = ficrSnapshot;
    this._ficrThrows = ficrThrows;
    this.dpidrCalls = 0;
    this.ficrCalls = 0;
  }
  async readDpidr() {
    this.dpidrCalls++;
    return this._dpidr;
  }
  async readMemBlock(addr, len) {
    this.ficrCalls++;
    if (this._ficrThrows) throw new Error("ficr read failed");
    if (this._ficrSnapshot) return this._ficrSnapshot;
    return new Uint8Array(len);
  }
}

test("Nrf52Target: constructor stores adiSession", () => {
  const adi = new FakeAdi();
  const t = new Nrf52Target(adi);
  assert.equal(t.adiSession, adi);
});

test("Nrf52Target: identify calls readDpidr", async () => {
  const adi = new FakeAdi();
  const t = new Nrf52Target(adi);
  await t.identify();
  assert.equal(adi.dpidrCalls, 1);
});

test("Nrf52Target: identify returns family 'nRF52' on success", async () => {
  const adi = new FakeAdi();
  const t = new Nrf52Target(adi);
  const info = await t.identify();
  assert.equal(info.family, "nRF52");
});

test("Nrf52Target: identify returns dpidr as hex string", async () => {
  const adi = new FakeAdi({ dpidr: 0x0bc10477 });
  const t = new Nrf52Target(adi);
  const info = await t.identify();
  assert.equal(info.dpidr, "0xbc10477");
});

test("Nrf52Target: identify reads FICR at 0x10000100 length 0x14", async () => {
  const adi = new FakeAdi();
  const t = new Nrf52Target(adi);
  await t.identify();
  assert.equal(adi.ficrCalls, 1);
});

test("Nrf52Target: identify returns FICR-detected part when parse succeeds", async () => {
  const validFicr = new Uint8Array(0x14);
  const view = new DataView(validFicr.buffer);
  view.setUint32(0x00, 0x52832, true);
  view.setUint32(0x04, 0xabcd1234, true);
  const adi = new FakeAdi({ ficrSnapshot: validFicr });
  const t = new Nrf52Target(adi);
  const info = await t.identify();
  assert.equal(info.part, "nRF52 (FICR detected)");
  assert.ok(info.ficr);
});

test("Nrf52Target: identify returns probe-detect part when FICR throws", async () => {
  const adi = new FakeAdi({ ficrThrows: true });
  const t = new Nrf52Target(adi);
  const info = await t.identify();
  assert.equal(info.part, "nRF52 (probe-level detect)");
  assert.equal(info.ficr, null);
});

test("Nrf52Target: identify handles FICR parse failure", async () => {
  const adi = new FakeAdi({ ficrThrows: true });
  const t = new Nrf52Target(adi);
  const info = await t.identify();
  assert.equal(info.family, "nRF52");
  assert.equal(info.part, "nRF52 (probe-level detect)");
  assert.equal(info.ficr, null);
});

test("Nrf52Target: identify returns FICR data with parsed fields", async () => {
  const snap = new Uint8Array(0x14);
  const view = new DataView(snap.buffer);
  view.setUint32(0x00, 0x52832, true);
  view.setUint32(0x04, 0x12345678, true);
  view.setUint32(0x08, 0xabcd, true);
  view.setUint32(0x0c, 0x1000, true);
  view.setUint32(0x10, 0x40000, true);
  const adi = new FakeAdi({ ficrSnapshot: snap });
  const t = new Nrf52Target(adi);
  const info = await t.identify();
  assert.equal(info.family, "nRF52");
  assert.equal(info.part, "nRF52 (FICR detected)");
  assert.equal(info.ficr.part, 0x52832);
  assert.equal(info.ficr.variant, 0x12345678);
  assert.equal(info.ficr.package, 0xabcd);
  assert.equal(info.ficr.ram, 0x1000);
  assert.equal(info.ficr.flash, 0x40000);
});

test("Nrf52Target: identify returns dpidr in hex even for zero value", async () => {
  const adi = new FakeAdi({ dpidr: 0 });
  const t = new Nrf52Target(adi);
  const info = await t.identify();
  assert.equal(info.dpidr, "0x0");
});

test("Nrf52Target: identify returns FICR data when valid", async () => {
  const snap = new Uint8Array(0x14);
  const view = new DataView(snap.buffer);
  view.setUint32(0x00, 0x52832, true);
  view.setUint32(0x04, 0x12345678, true);
  view.setUint32(0x08, 0xabcd, true);
  view.setUint32(0x0c, 0x1000, true);
  view.setUint32(0x10, 0x40000, true);
  const adi = new FakeAdi({ ficrSnapshot: snap });
  const t = new Nrf52Target(adi);
  const info = await t.identify();
  assert.ok(info.ficr);
  assert.equal(info.ficr.part, 0x52832);
  assert.equal(info.ficr.variant, 0x12345678);
  assert.equal(info.ficr.flash, 0x40000);
});
