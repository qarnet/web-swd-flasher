import test from "node:test";
import assert from "node:assert/strict";
import { createFlashProgrammer, PROGRAMMERS } from "../../src/targets/flash-programmer-registry.js";

test("PROGRAMMERS has nvmc-nrf52 entry", () => {
  assert.ok(PROGRAMMERS["nvmc-nrf52"]);
  assert.equal(typeof PROGRAMMERS["nvmc-nrf52"], "function");
});

test("createFlashProgrammer returns Nrf52FlashProgrammer", () => {
  const mockAdi = {};
  const mockBus = {};
  const prog = createFlashProgrammer(
    { programmer: "nvmc-nrf52" },
    { adi: mockAdi, bus: mockBus }
  );
  assert.ok(prog);
  assert.equal(typeof prog.programImage, "function");
});

test("createFlashProgrammer throws for unsupported programmer", () => {
  assert.throws(
    () => createFlashProgrammer(
      { programmer: "unsupported" },
      { adi: {}, bus: {} }
    ),
    /No flash programmer/
  );
});
