import test from "node:test";
import assert from "node:assert/strict";
import { CmsisDapBackend } from "../../src/backends/cmsis-dap/backend.js";
import { EventBus } from "../../src/core/event-bus.js";
import { Topics } from "../../src/core/event-bus-topics.js";
import { TARGETS } from "../../src/targets/target-registry.js";
import { AIRCR, AIRCR_VECTKEY_SYSRESETREQ } from "../../src/arch/cortex-m.js";
import { FakeAdi } from "./helpers/fake-adi.mjs";

function makeBackend(overrides = {}) {
  const bus = overrides.bus || new EventBus();
  const transport = overrides.transport || { device: { productName: "TestDevice", manufacturerName: "TestMfr" } };
  const core = overrides.core || {
    _caps: overrides.caps,
    dapInfo: async () => overrides.dapInfo || {},
    connect: async () => {},
    disconnect: async () => {},
    selectSwdTarget: async () => {},
  };
  const adi = overrides.adi || Object.assign(new FakeAdi(), {
    connectSwd: async () => {},
    readDpidr: async () => 0x0bc10477,
  });
  const recovery = overrides.recovery || { checkProtection: async () => true, eraseAll: async () => {} };
  const cortex = overrides.cortex || { halt: async () => {}, resume: async () => {}, step: async () => {}, readCoreRegs: async () => ({}), isHalted: async () => false };

  // Use real CmsisDapBackend but override internals to avoid real WebUSB transport
  const backend = Object.create(CmsisDapBackend.prototype);
  backend.transport = transport;
  backend.core = core;
  backend._adi = adi;
  backend._recovery = recovery;
  backend._cortex = cortex;
  backend._bus = bus;
  backend._detectedTarget = null;
  backend._ficr = null;
  backend._targetOverride = null;
  backend._flash = overrides.flash || null;
  return backend;
}

test("CmsisDapBackend: construction creates transport, core, adi, recovery, cortex", () => {
  const bus = new EventBus();
  const transport = { device: null };
  const core = { _caps: {} };
  const adi = new FakeAdi();
  const recovery = {};
  const cortex = {};

  const backend = makeBackend({ bus, transport, core, adi, recovery, cortex });

  assert.ok(backend.transport);
  assert.ok(backend.core);
  assert.ok(backend._adi);
  assert.ok(backend._recovery);
  assert.ok(backend._cortex);
  assert.equal(backend._bus, bus);
  assert.equal(backend._detectedTarget, null);
  assert.equal(backend._ficr, null);
  assert.equal(backend._targetOverride, null);
});

test("CmsisDapBackend: activeTarget returns _targetOverride when set", () => {
  const backend = makeBackend();
  backend._targetOverride = TARGETS.find(t => t.id === "nrf52840");
  assert.equal(backend.activeTarget.id, "nrf52840");
});

test("CmsisDapBackend: activeTarget returns _detectedTarget when no override", () => {
  const backend = makeBackend();
  backend._detectedTarget = TARGETS.find(t => t.id === "nrf52833");
  assert.equal(backend.activeTarget.id, "nrf52833");
});

test("CmsisDapBackend: activeTarget falls back to generic target when neither set", () => {
  const backend = makeBackend();
  assert.equal(backend.activeTarget.id, "generic");
});

test("CmsisDapBackend: availableTargets returns TARGETS array", () => {
  const backend = makeBackend();
  assert.equal(backend.availableTargets, TARGETS);
});

test("CmsisDapBackend: setTargetOverride(null) resets override", () => {
  const backend = makeBackend();
  backend._targetOverride = TARGETS[0];
  backend.setTargetOverride(null);
  assert.equal(backend._targetOverride, null);
});

test("CmsisDapBackend: setTargetOverride('auto') resets override", () => {
  const backend = makeBackend();
  backend._targetOverride = TARGETS[0];
  backend.setTargetOverride("auto");
  assert.equal(backend._targetOverride, null);
});

test("CmsisDapBackend: setTargetOverride('nrf52840') looks up and sets", () => {
  const backend = makeBackend();
  backend.setTargetOverride("nrf52840");
  assert.equal(backend._targetOverride.id, "nrf52840");
});

test("CmsisDapBackend: setTargetOverride('unknown') throws", () => {
  const backend = makeBackend();
  assert.throws(() => backend.setTargetOverride("unknown-id"), /Unknown target id/);
});

test("CmsisDapBackend: getMemoryAccess returns methods delegating to _adi", async () => {
  const adi = new FakeAdi();
  const backend = makeBackend({ adi });
  const access = backend.getMemoryAccess();
  await access.writeMem32(0x100, 0xdeadbeef);
  await access.readMem32(0x100);
  await access.readBlockFast(0x100, 4);
  assert.ok(adi.writes.find(w => w.addr === 0x100 && w.value === 0xdeadbeef));
  assert.equal(typeof access.maxReadBlockWordCount, "number");
});

test("CmsisDapBackend: createRttSession returns new RttClient", () => {
  const adi = new FakeAdi();
  const backend = makeBackend({ adi });
  const client = backend.createRttSession();
  assert.ok(client);
  assert.equal(client.adi, adi);
});

test("CmsisDapBackend: getCortex returns _cortex", () => {
  const cortex = { halt: async () => {} };
  const backend = makeBackend({ cortex });
  assert.equal(backend.getCortex(), cortex);
});

test("CmsisDapBackend: getRecovery returns _recovery", () => {
  const recovery = { checkProtection: async () => true };
  const backend = makeBackend({ recovery });
  assert.equal(backend.getRecovery(), recovery);
});

test("CmsisDapBackend: withQuietLog delegates to transport", async () => {
  let called = false;
  const transport = { withQuiet: async (fn) => { called = true; return fn(); }, device: null };
  const backend = makeBackend({ transport });
  await backend.withQuietLog(() => 42);
  assert.equal(called, true);
});

test("CmsisDapBackend: requestDevice delegates to transport", async () => {
  let called = false;
  const transport = { requestDevice: async () => { called = true; return "device"; }, device: null };
  const backend = makeBackend({ transport });
  await backend.requestDevice();
  assert.equal(called, true);
});

test("CmsisDapBackend: getAuthorizedDevices delegates to transport", async () => {
  let called = false;
  const transport = { getAuthorizedDevices: async () => { called = true; return []; }, device: null };
  const backend = makeBackend({ transport });
  await backend.getAuthorizedDevices();
  assert.equal(called, true);
});

test("CmsisDapBackend: connect emits BACKEND_PROGRESS at 50 and 100", async () => {
  const bus = new EventBus();
  const progressEvents = [];
  bus.on(Topics.BACKEND_PROGRESS, (data) => progressEvents.push(data.percent));
  const backend = makeBackend({ bus });
  await backend.connect();
  assert.equal(progressEvents[0], 50);
  assert.equal(progressEvents[progressEvents.length - 1], 100);
});

test("CmsisDapBackend: disconnect calls core.disconnect", async () => {
  let disconnected = false;
  const core = { disconnect: async () => { disconnected = true; }, connect: async () => {}, _caps: {} };
  const backend = makeBackend({ core });
  await backend.disconnect();
  assert.equal(disconnected, true);
});

test("CmsisDapBackend: getProbeInfo uses core._caps when available", async () => {
  const core = {
    _caps: { product: "MyProbe", vendor: "Acme", packetSize: 64 },
    dapInfo: async () => ({ product: "Other" }),
  };
  const backend = makeBackend({ core });
  const info = await backend.getProbeInfo();
  assert.equal(info.name, "MyProbe");
  assert.equal(info.manufacturer, "Acme");
});

test("CmsisDapBackend: getProbeInfo calls dapInfo when _caps missing", async () => {
  const core = {
    _caps: null,
    dapInfo: async () => ({ product: "FromDap", vendor: "Vendor2", packetSize: 128 }),
  };
  const backend = makeBackend({ core });
  const info = await backend.getProbeInfo();
  assert.equal(info.name, "FromDap");
});

test("CmsisDapBackend: getProbeInfo returns backend: 'cmsis-dap'", async () => {
  const backend = makeBackend({ core: { _caps: {}, dapInfo: async () => ({}) } });
  const info = await backend.getProbeInfo();
  assert.equal(info.backend, "cmsis-dap");
});

test("CmsisDapBackend: getProbeInfo includes all capability flags", async () => {
  const backend = makeBackend({ core: { _caps: null, dapInfo: async () => ({ hasSWD: true, hasJTAG: false, hasUART: true }) } });
  const info = await backend.getProbeInfo();
  assert.equal(info.hasSWD, true);
  assert.equal(info.hasJTAG, false);
  assert.equal(info.hasUART, true);
});

test("CmsisDapBackend: getProbeInfo falls back to transport device for name", async () => {
  const core = { _caps: null, dapInfo: async () => ({}) };
  const transport = { device: { productName: "DevName", manufacturerName: "DevMfr" } };
  const backend = makeBackend({ core, transport });
  const info = await backend.getProbeInfo();
  assert.equal(info.name, "DevName");
  assert.equal(info.manufacturer, "DevMfr");
});

test("CmsisDapBackend: checkProtection delegates to _recovery", async () => {
  let called = false;
  const recovery = { checkProtection: async () => { called = true; return false; } };
  const backend = makeBackend({ recovery });
  const result = await backend.checkProtection();
  assert.equal(called, true);
  assert.equal(result, false);
});

test("CmsisDapBackend: recoverDevice delegates to _recovery.eraseAll with onProgress", async () => {
  const calls = [];
  const recovery = { eraseAll: async (onProgress) => { calls.push({ onProgress }); } };
  const backend = makeBackend({ recovery });
  const onProgress = () => {};
  await backend.recoverDevice(onProgress);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].onProgress, onProgress);
});

test("CmsisDapBackend: getTargetInfo reads DPIDR via _adi", async () => {
  const adi = new FakeAdi();
  const backend = makeBackend({ adi });
  const info = await backend.getTargetInfo();
  assert.ok(info.dpidr.startsWith("0x"));
});

test("CmsisDapBackend: getTargetInfo includes target fields", async () => {
  const backend = makeBackend();
  const info = await backend.getTargetInfo();
  assert.ok(info.family);
  assert.ok(info.id);
  assert.ok(info.flash);
  assert.ok(info.ram);
});

test("CmsisDapBackend: getTargetInfo autoDetected is true when no override", async () => {
  const backend = makeBackend();
  const info = await backend.getTargetInfo();
  assert.equal(info.autoDetected, true);
});

test("CmsisDapBackend: getTargetInfo autoDetected is false when override set", async () => {
  const backend = makeBackend();
  backend._targetOverride = TARGETS[0];
  const info = await backend.getTargetInfo();
  assert.equal(info.autoDetected, false);
});

test("CmsisDapBackend: getTargetInfo includes ficr when set", async () => {
  const backend = makeBackend();
  backend._ficr = { part: 0x52840 };
  const info = await backend.getTargetInfo();
  assert.equal(info.ficr.part, 0x52840);
});

test("CmsisDapBackend: readMemory delegates to _adi", async () => {
  const adi = new FakeAdi();
  const backend = makeBackend({ adi });
  await backend.readMemory(0x20000000, 16);
  assert.equal(adi.blockReads.length, 1);
  assert.equal(adi.blockReads[0].address, 0x20000000);
});

test("CmsisDapBackend: programImage delegates to _flash", async () => {
  let called = false;
  const flash = { programImage: async (img, opts) => { called = true; return { ok: true }; } };
  const backend = makeBackend({ flash });
  await backend.programImage({ byteCount: 1024 }, { progress: true });
  assert.equal(called, true);
});

test("CmsisDapBackend: verifyImage delegates to _flash", async () => {
  let called = false;
  const flash = { verifyImage: async () => { called = true; return { ok: true }; } };
  const backend = makeBackend({ flash });
  await backend.verifyImage({ byteCount: 1024 }, {});
  assert.equal(called, true);
});

test("CmsisDapBackend: reset('run') writes AIRCR with VECTKEY and SYSRESETREQ", async () => {
  const adi = new FakeAdi();
  const backend = makeBackend({ adi });
  const result = await backend.reset("run");
  assert.equal(result.mode, "run");
  assert.equal(result.method, "sysresetreq");
  const aircrWrite = adi.writes.find(w => w.addr === AIRCR);
  assert.ok(aircrWrite);
  assert.equal(aircrWrite.value, AIRCR_VECTKEY_SYSRESETREQ);
});

test("CmsisDapBackend: reset('halt') does not write AIRCR", async () => {
  const adi = new FakeAdi();
  const backend = makeBackend({ adi });
  const result = await backend.reset("halt");
  assert.equal(result.mode, "halt");
  const aircrWrite = adi.writes.find(w => w.addr === AIRCR);
  assert.equal(aircrWrite, undefined);
});

test("CmsisDapBackend: selectSwdTarget delegates to core", async () => {
  let called = false;
  const core = { selectSwdTarget: async (s) => { called = true; return s; }, _caps: {} };
  const backend = makeBackend({ core });
  await backend.selectSwdTarget(0);
  assert.equal(called, true);
});

test("CmsisDapBackend: haltCore delegates to _cortex.halt", async () => {
  let called = false;
  const cortex = { halt: async () => { called = true; } };
  const backend = makeBackend({ cortex });
  await backend.haltCore();
  assert.equal(called, true);
});

test("CmsisDapBackend: resumeCore delegates to _cortex.resume", async () => {
  let called = false;
  const cortex = { resume: async () => { called = true; } };
  const backend = makeBackend({ cortex });
  await backend.resumeCore();
  assert.equal(called, true);
});

test("CmsisDapBackend: stepCore delegates to _cortex.step", async () => {
  let called = false;
  const cortex = { step: async () => { called = true; } };
  const backend = makeBackend({ cortex });
  await backend.stepCore();
  assert.equal(called, true);
});

test("CmsisDapBackend: readCoreRegs delegates to _cortex.readCoreRegs", async () => {
  let called = false;
  const cortex = { readCoreRegs: async () => { called = true; return { R0: 0 }; } };
  const backend = makeBackend({ cortex });
  await backend.readCoreRegs();
  assert.equal(called, true);
});

test("CmsisDapBackend: isCoreHalted delegates to _cortex.isHalted", async () => {
  let called = false;
  const cortex = { isHalted: async () => { called = true; return true; } };
  const backend = makeBackend({ cortex });
  const result = await backend.isCoreHalted();
  assert.equal(called, true);
  assert.equal(result, true);
});

test("CmsisDapBackend: capabilities returns all true", () => {
  const backend = makeBackend();
  const caps = backend.capabilities();
  assert.equal(caps.supportsReadMemory, true);
  assert.equal(caps.supportsFlash, true);
  assert.equal(caps.supportsVerify, true);
  assert.equal(caps.supportsReset, true);
  assert.equal(caps.supportsRecovery, true);
});
