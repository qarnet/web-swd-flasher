import { ProbeBackend } from "../backend-interface.js";
import { CmsisDapWebUsbTransport } from "./transport-webusb.js";
import { CmsisDapCore } from "./dap-core.js";
import { AdiSession } from "./adi.js";
import { Nrf52Recovery } from "./nrf52-recovery.js";
import { DapCortex } from "./dap-cortex.js";
import { RttClient } from "../../rtt/rtt-client.js";
import { TARGETS, detectTarget } from "../../targets/target-registry.js";
import { createFlashProgrammer } from "../../targets/flash-programmer-registry.js";
import { AIRCR, AIRCR_VECTKEY_SYSRESETREQ } from "../../arch/cortex-m.js";
import { Topics } from "../../core/event-bus-topics.js";

export class CmsisDapBackend extends ProbeBackend {
  constructor(bus, logger = null, swdClockHz = 1000000) {
    super();
    this.transport = new CmsisDapWebUsbTransport(logger);
    this.core = new CmsisDapCore(this.transport, swdClockHz);
    this._adi = new AdiSession(this.core);
    this._flash = null;
    this._recovery = new Nrf52Recovery(this._adi);
    this._cortex = new DapCortex(this._adi);
    this._bus = bus;
    this._detectedTarget = null;
    this._ficr = null;
    this._targetOverride = null;
  }

  get activeTarget() {
    return this._targetOverride ?? this._detectedTarget ?? TARGETS.find((t) => t.id === "generic");
  }

  get availableTargets() {
    return TARGETS;
  }

  setTargetOverride(targetId) {
    if (targetId === null || targetId === "auto") {
      this._targetOverride = null;
      return;
    }
    const found = TARGETS.find((t) => t.id === targetId);
    if (!found) throw new Error(`Unknown target id: ${targetId}`);
    this._targetOverride = found;
  }

  getMemoryAccess() {
    return {
      readMem32: (addr) => this._adi.readMem32(addr),
      writeMem32: (addr, val) => this._adi.writeMem32(addr, val),
      readBlockFast: (addr, wordCount) => this._adi.readMemBlockFast(addr, wordCount),
      maxReadBlockWordCount: this._adi.maxReadBlockWordCount,
    };
  }

  createRttSession() {
    return new RttClient(this._adi);
  }

  getCortex() {
    return this._cortex;
  }

  getRecovery() {
    return this._recovery;
  }

  async withQuietLog(fn) {
    return this.transport.withQuiet(fn);
  }

  async requestDevice() {
    return this.transport.requestDevice();
  }

  async getAuthorizedDevices() {
    return this.transport.getAuthorizedDevices();
  }

  async connect() {
    this._bus.emit(Topics.BACKEND_PROGRESS, { percent: 50 });
    await this.core.connect();
    await this._adi.connectSwd();
    const { target, ficr } = await detectTarget(this._adi);
    this._detectedTarget = target;
    this._ficr = ficr;
    this._flash = createFlashProgrammer(this.activeTarget, { adi: this._adi, bus: this._bus });
    this._bus.emit(Topics.BACKEND_PROGRESS, { percent: 100 });
  }

  async disconnect() {
    await this.core.disconnect();
  }

  async getProbeInfo() {
    const info = this.core._caps ?? await this.core.dapInfo();
    return {
      backend: "cmsis-dap",
      name: info.product || this.transport.device?.productName || "CMSIS-DAP",
      manufacturer: info.vendor || this.transport.device?.manufacturerName || "Unknown",
      transport: info.transport,
      packetSize: info.packetSize,
      maxPacketCount: info.maxPacketCount,
      maxPacketSize: info.maxPacketSize,
      capabilities: info.capabilities,
      hasSWD: info.hasSWD,
      hasJTAG: info.hasJTAG,
      hasSWO_UART: info.hasSWO_UART,
      hasSWO_Manchester: info.hasSWO_Manchester,
      hasAtomicCommands: info.hasAtomicCommands,
      hasTestDomainTimer: info.hasTestDomainTimer,
      hasSWO_Streaming: info.hasSWO_Streaming,
      hasUART: info.hasUART
    };
  }

  async checkProtection() {
    return this._recovery.checkProtection();
  }

  async recoverDevice(onProgress = null) {
    return this._recovery.eraseAll(onProgress);
  }

  async getTargetInfo() {
    const tgt = this.activeTarget;
    const dpidr = await this._adi.readDpidr();
    return {
      family: tgt.family,
      part: tgt.label,
      id: tgt.id,
      dpidr: `0x${dpidr.toString(16)}`,
      ficr: this._ficr,
      flash: tgt.flash,
      ram: tgt.ram,
      programmer: tgt.programmer,
      autoDetected: this._targetOverride === null
    };
  }

  async readMemory(addr, len) {
    return this._adi.readMemBlock(addr, len);
  }

  async programImage(image, options) {
    return this._flash.programImage(image, options);
  }

  async verifyImage(image, options) {
    return this._flash.verifyImage(image, options);
  }

  async reset(mode = "run") {
    if (mode === "run") {
      await this._adi.writeMem32(AIRCR, AIRCR_VECTKEY_SYSRESETREQ);
      return { mode: "run", method: "sysresetreq" };
    }
    return { mode };
  }

  async selectSwdTarget(targetSel) {
    return this.core.selectSwdTarget(targetSel);
  }

  async haltCore() { return this._cortex.halt(); }
  async resumeCore() { return this._cortex.resume(); }
  async stepCore() { return this._cortex.step(); }
  async readCoreRegs() { return this._cortex.readCoreRegs(); }
  async isCoreHalted() { return this._cortex.isHalted(); }

  capabilities() {
    return {
      supportsReadMemory: true,
      supportsFlash: true,
      supportsVerify: true,
      supportsReset: true,
      supportsRecovery: true
    };
  }

  async diagRawRead32(addr) {
    const adi = this._adi;
    const core = this.core;
    const results = {};
    results.step1_selectAp = await (async () => {
      await adi.selectAp(0, 0);
      const sel = await core.transfer("dp", 0x08, null);
      return `DP SELECT after selectAp(0,0): 0x${sel.toString(16)}`;
    })();
    results.step2_writeCSW = await (async () => {
      await core.transferMultiple([
        { port: "ap", register: 0x00, value: 0x23000052 }
      ]);
      return "CSW = 0x23000052 written via transferMultiple";
    })();
    results.step3_writeTAR = await (async () => {
      await core.transferMultiple([
        { port: "ap", register: 0x04, value: addr >>> 0 }
      ]);
      return `TAR = 0x${(addr >>> 0).toString(16)} written via transferMultiple`;
    })();
    results.step4_readDRW = await (async () => {
      const val = await core.transferMultiple([
        { port: "ap", register: 0x0c, value: null }
      ]);
      return `DRW read via transferMultiple: 0x${val[0].toString(16)}`;
    })();
    results.step5_selectAp_again = await (async () => {
      await adi.selectAp(0, 0);
      const sel = await core.transfer("dp", 0x08, null);
      return `DP SELECT after second selectAp(0,0): 0x${sel.toString(16)}`;
    })();
    results.step6_readMem32 = await (async () => {
      const val = await adi.readMem32(addr);
      return `readMem32(0x${(addr >>> 0).toString(16)}): 0x${val.toString(16)}`;
    })();
    results.step7_readAnotherAddr = await (async () => {
      const val = await adi.readMem32(addr + 4);
      return `readMem32(0x${((addr + 4) >>> 0).toString(16)}): 0x${val.toString(16)}`;
    })();
    return results;
  }
}
