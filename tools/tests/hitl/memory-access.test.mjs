import test from "node:test";
import assert from "node:assert/strict";
import { openProbe, teardown, getAdi } from "./probe.mjs";

let probeError = null;
let connected = false;

try {
  await openProbe();
  connected = true;
} catch (err) {
  probeError = err.message;
}

function skipIfNoProbe() {
  if (probeError) return { skip: probeError };
  if (!connected) return { skip: "SWD connect failed" };
  return {};
}

const RAM_BASE = 0x20000000;

test("ram: single word write/read-back", skipIfNoProbe(), async () => {
  const SENTINEL = 0xdeadbeef;
  await getAdi().writeMem32(RAM_BASE, SENTINEL);
  const readback = await getAdi().readMem32(RAM_BASE);
  assert.equal(readback, SENTINEL >>> 0,
    `Readback mismatch: wrote 0x${SENTINEL.toString(16)}, got 0x${readback.toString(16)}`);
});

test("ram: block write/read-back (14 words)", skipIfNoProbe(), async () => {
  const wordCount = 14;
  const words = new Uint32Array(wordCount);
  for (let i = 0; i < wordCount; i++) words[i] = (0xab000000 | i) >>> 0;

  await getAdi().writeMemBlockFast(RAM_BASE, words, 0, wordCount);
  const readback = await getAdi().readMemBlockFast(RAM_BASE, wordCount);

  for (let i = 0; i < wordCount; i++) {
    assert.equal(readback[i], words[i],
      `Word[${i}] mismatch: wrote 0x${words[i].toString(16)}, got 0x${readback[i].toString(16)}`);
  }
});

test("ram: block write spanning 1KB boundary", skipIfNoProbe(), async () => {
  const startAddr = (RAM_BASE + 0x400) - 4 * 4; // 4 words before 1KB boundary
  const wordCount = 30;
  const words = new Uint32Array(wordCount);
  for (let i = 0; i < wordCount; i++) words[i] = (0xcc000000 | (i * 0x11)) >>> 0;

  await getAdi().writeMemBlockFast(startAddr, words, 0, wordCount);
  const readback = await getAdi().readMemBlockFast(startAddr, wordCount);

  for (let i = 0; i < wordCount; i++) {
    assert.equal(readback[i], words[i],
      `Word[${i}] @ 0x${(startAddr + i * 4).toString(16)}: wrote 0x${words[i].toString(16)}, got 0x${readback[i].toString(16)}`);
  }
});

test("ram: readMemBlockFast full chunk size", skipIfNoProbe(), async () => {
  const adi = getAdi();
  const maxWords = adi.maxReadBlockWordCount;
  const testData = new Uint32Array(maxWords);
  for (let i = 0; i < maxWords; i++) testData[i] = (0xdd000000 | i) >>> 0;

  await adi.writeMemBlockFast(RAM_BASE + 0x800, testData);
  const readback = await adi.readMemBlockFast(RAM_BASE + 0x800, maxWords);
  assert.equal(readback.length, maxWords);
  // Verify first and last
  assert.equal(readback[0], testData[0], "First word mismatch");
  assert.equal(readback[maxWords - 1], testData[maxWords - 1], "Last word mismatch");
});

test("ram: writeMem32 at multiple addresses", skipIfNoProbe(), async () => {
  const addrs = [RAM_BASE + 0x100, RAM_BASE + 0x200, RAM_BASE + 0x300];
  const vals = [0x11111111, 0x22222222, 0x33333333];
  for (let i = 0; i < addrs.length; i++) {
    await getAdi().writeMem32(addrs[i], vals[i]);
  }
  for (let i = 0; i < addrs.length; i++) {
    const v = await getAdi().readMem32(addrs[i]);
    assert.equal(v, vals[i] >>> 0,
      `Addr 0x${addrs[i].toString(16)}: wrote 0x${vals[i].toString(16)}, got 0x${v.toString(16)}`);
  }
});

test.after(async () => {
  await teardown();
});