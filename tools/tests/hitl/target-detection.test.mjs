import test from "node:test";
import assert from "node:assert/strict";
import { openProbe, teardown, getAdi, detectConnectedTarget } from "./probe.mjs";

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

const FICR_BASE = 0x10000000;
const FICR_CODEPAGESIZE = FICR_BASE + 0x010;
const FICR_CODESIZE = FICR_BASE + 0x014;
const FICR_PART = FICR_BASE + 0x100;

test("target: FICR CODEPAGESIZE is 4096", skipIfNoProbe(), async () => {
  const pageSize = await getAdi().readMem32(FICR_CODEPAGESIZE);
  assert.equal(pageSize, 4096, `Expected 4096, got ${pageSize} (0x${pageSize.toString(16)})`);
});

test("target: FICR part number looks like nRF52", skipIfNoProbe(), async () => {
  const part = await getAdi().readMem32(FICR_PART);
  assert.ok(
    (part >>> 16) === 0x0005,
    `Expected nRF52xxx, FICR_PART=0x${part.toString(16)}`
  );
  console.log(`  Part: nRF${part.toString(16).toUpperCase()}`);
});

test("target: FICR CODESIZE is non-zero", skipIfNoProbe(), async () => {
  const codeSize = await getAdi().readMem32(FICR_CODESIZE);
  assert.ok(codeSize > 0, `CODESIZE=${codeSize} should be > 0`);
  console.log(`  Code size (pages): ${codeSize}`);
});

test("target: detectTarget returns a valid entry", skipIfNoProbe(), async () => {
  const { target, ficr } = await detectConnectedTarget();
  assert.ok(target, "detectTarget returned null");
  assert.ok(target.id, "target should have an id");
  assert.ok(target.flash, "target should have flash info");
  assert.ok(target.flash.pageSize > 0, "pageSize should be > 0");
  console.log(`  Detected: ${target.label} (family: ${target.family})`);
});

test("target: FICR variant is readable", skipIfNoProbe(), async () => {
  const variant = await getAdi().readMem32(FICR_PART + 0x04);
  // Variant is ASCII-encoded, e.g. "AAA0" = 0x41414130
  console.log(`  Variant: 0x${variant.toString(16)}`);
  // Just verify it doesn't throw — variant can be 0xFFFFFFFF on some chips
  assert.ok(true);
});

test.after(async () => {
  await teardown();
});