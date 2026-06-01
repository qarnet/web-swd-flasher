import test from "node:test";
import assert from "node:assert/strict";
import { Nrf52Recovery } from "../../src/backends/cmsis-dap/nrf52-recovery.js";

class FakeAdi {
  constructor({ eraseStatus = [0], apProtectStatus = 0 } = {}) {
    this.eraseStatusQueue = [...eraseStatus];
    this.apProtectStatus = apProtectStatus;
    this.selectApCalls = [];
    this.readApCalls = [];
    this.writeApCalls = [];
    this.reconnectCalled = false;
  }

  async selectAp(apIndex, bank) {
    this.selectApCalls.push({ apIndex, bank });
  }

  async readAp(register) {
    this.readApCalls.push({ register });
    if (register === Nrf52Recovery.REG_ERASEALLSTATUS) {
      const v = this.eraseStatusQueue.shift();
      return v ?? 0;
    }
    if (register === Nrf52Recovery.REG_APPROTECTSTATUS) {
      return this.apProtectStatus;
    }
    return 0;
  }

  async writeAp(register, value) {
    this.writeApCalls.push({ register, value });
  }

  async reconnectSwd() {
    this.reconnectCalled = true;
  }
}

test("eraseAll polls ERASEALLSTATUS until 0", async () => {
  const adi = new FakeAdi({ eraseStatus: [1, 1, 0] });
  const recovery = new Nrf52Recovery(adi);
  await recovery.eraseAll();
  const statusReads = adi.readApCalls.filter(c => c.register === Nrf52Recovery.REG_ERASEALLSTATUS);
  assert.ok(statusReads.length >= 3, `expected at least 3 ERASEALLSTATUS reads, got ${statusReads.length}`);
});

test("eraseAll asserts then deasserts RESET", async () => {
  const adi = new FakeAdi({ eraseStatus: [0] });
  const recovery = new Nrf52Recovery(adi);
  await recovery.eraseAll();
  const resetWrites = adi.writeApCalls.filter(c => c.register === Nrf52Recovery.REG_RESET);
  assert.equal(resetWrites.length, 2, `expected 2 REG_RESET writes, got ${resetWrites.length}`);
  assert.equal(resetWrites[0].value, 1, "first RESET write should be 1 (assert)");
  assert.equal(resetWrites[1].value, 0, "second RESET write should be 0 (deassert)");
});

test("eraseAll calls reconnectSwd after reset", async () => {
  const adi = new FakeAdi({ eraseStatus: [0] });
  const recovery = new Nrf52Recovery(adi);
  await recovery.eraseAll();
  assert.ok(adi.reconnectCalled, "expected reconnectSwd to be called");
});

test("eraseAll returns unlocked true when APPROTECTSTATUS != 0", async () => {
  const adi = new FakeAdi({ eraseStatus: [0], apProtectStatus: 1 });
  const recovery = new Nrf52Recovery(adi);
  const result = await recovery.eraseAll();
  assert.equal(result.unlocked, true);
});

test("eraseAll returns unlocked false when APPROTECTSTATUS == 0", async () => {
  const adi = new FakeAdi({ eraseStatus: [0], apProtectStatus: 0 });
  const recovery = new Nrf52Recovery(adi);
  const result = await recovery.eraseAll();
  assert.equal(result.unlocked, false);
});

test("checkProtection reports locked when APPROTECTSTATUS == 0", async () => {
  const adi = new FakeAdi({ apProtectStatus: 0 });
  const recovery = new Nrf52Recovery(adi);
  const result = await recovery.checkProtection();
  assert.equal(result.locked, true);
  assert.equal(result.apProtectStatus, 0);
});

test("checkProtection reports unlocked when APPROTECTSTATUS != 0", async () => {
  const adi = new FakeAdi({ apProtectStatus: 0xff });
  const recovery = new Nrf52Recovery(adi);
  const result = await recovery.checkProtection();
  assert.equal(result.locked, false);
});

test("eraseAll selects CTRL-AP before erase", async () => {
  const adi = new FakeAdi({ eraseStatus: [0] });
  const recovery = new Nrf52Recovery(adi);
  await recovery.eraseAll();
  const ctrlApSelects = adi.selectApCalls.filter(c => c.apIndex === Nrf52Recovery.CTRL_AP);
  assert.ok(ctrlApSelects.length >= 1, `expected selectAp(CTRL_AP) to be called, got ${adi.selectApCalls.length} calls`);
});
