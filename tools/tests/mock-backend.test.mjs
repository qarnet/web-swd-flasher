import test from "node:test";
import assert from "node:assert/strict";
import { MockBackend } from "../../src/backends/mock-backend.js";

test("MockBackend getMemoryAccess returns usable stubs", async () => {
  const b = new MockBackend();
  const mem = b.getMemoryAccess();
  assert.equal(typeof mem.readMem32, "function");
  assert.equal(typeof mem.writeMem32, "function");
  assert.equal(typeof mem.readBlockFast, "function");
  assert.equal(mem.maxReadBlockWordCount, 256);

  const val = await mem.readMem32(0x1000);
  assert.equal(val, 0xdeadbeef);

  const block = await mem.readBlockFast(0x1000, 4);
  assert.equal(block.length, 4);
  assert.equal(block[0], 0xdeadbeef);
});

test("MockBackend createRttSession returns null", () => {
  const b = new MockBackend();
  assert.equal(b.createRttSession(), null);
});

test("MockBackend capabilities match expected", () => {
  const b = new MockBackend();
  const caps = b.capabilities();
  assert.equal(caps.supportsReadMemory, true);
  assert.equal(caps.supportsFlash, true);
  assert.equal(caps.supportsVerify, true);
  assert.equal(caps.supportsReset, true);
});
