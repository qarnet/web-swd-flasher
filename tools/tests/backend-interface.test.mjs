import test from "node:test";
import assert from "node:assert/strict";
import { ProbeBackend } from "../../src/backends/backend-interface.js";

test("ProbeBackend getMemoryAccess returns valid shape", () => {
  const b = new ProbeBackend();
  const mem = b.getMemoryAccess();
  assert.equal(typeof mem.readMem32, "function");
  assert.equal(typeof mem.writeMem32, "function");
  assert.equal(typeof mem.readBlockFast, "function");
  assert.equal(typeof mem.maxReadBlockWordCount, "number");
});

test("ProbeBackend getMemoryAccess throws on call", async () => {
  const b = new ProbeBackend();
  const mem = b.getMemoryAccess();

  await assert.rejects(async () => mem.readMem32(0x1000), /not implemented/);
  await assert.rejects(async () => mem.writeMem32(0x1000, 0xff), /not implemented/);
  await assert.rejects(async () => mem.readBlockFast(0x1000, 4), /not implemented/);
});

test("ProbeBackend createRttSession returns null by default", () => {
  const b = new ProbeBackend();
  assert.equal(b.createRttSession(), null);
});

test("ProbeBackend activeTarget returns null by default", () => {
  const b = new ProbeBackend();
  assert.equal(b.activeTarget, null);
});

test("ProbeBackend availableTargets returns empty array", () => {
  const b = new ProbeBackend();
  assert.deepStrictEqual(b.availableTargets, []);
});

test("ProbeBackend capabilities returns defaults", () => {
  const b = new ProbeBackend();
  const caps = b.capabilities();
  assert.equal(caps.supportsReadMemory, false);
  assert.equal(caps.supportsFlash, false);
  assert.equal(caps.supportsVerify, false);
  assert.equal(caps.supportsReset, false);
});
