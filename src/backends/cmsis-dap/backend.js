import { ProbeBackend } from "../backend-interface.js";
import { CmsisDapWebUsbTransport } from "./transport-webusb.js";
import { CmsisDapCore } from "./dap-core.js";
import { AdiSession } from "./adi.js";
import { Nrf52FlashProgrammer } from "./flash-nrf52.js";
import { Nrf52Recovery } from "./nrf52-recovery.js";
import { TARGETS, detectTarget } from "../../targets/target-registry.js";

export class CmsisDapBackend extends ProbeBackend {
  constructor(progressBus, logger = null, swdClockHz = 1000000) {
    super();
    this.transport = new CmsisDapWebUsbTransport(logger);
    this.core = new CmsisDapCore(this.transport, swdClockHz);
    this.adi = new AdiSession(this.core);
    this.flash = new Nrf52FlashProgrammer(progressBus, this.adi);
    this.recovery = new Nrf52Recovery(this.adi);
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

  async requestDevice() {
    return this.transport.requestDevice();
  }

  async getAuthorizedDevices() {
    return this.transport.getAuthorizedDevices();
  }

  async connect() {
    await this.core.connect();
    await this.adi.connectSwd();
    const { target, ficr } = await detectTarget(this.adi);
    this._detectedTarget = target;
    this._ficr = ficr;
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
    return this.recovery.checkProtection();
  }

  async recoverDevice(onProgress = null) {
    return this.recovery.eraseAll(onProgress);
  }

  async getTargetInfo() {
    const tgt = this.activeTarget;
    const dpidr = await this.adi.readDpidr();
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
    return this.adi.readMemBlock(addr, len);
  }

  async programImage(image, options) {
    return this.flash.programImage(image, options);
  }

  async verifyImage(image, options) {
    return this.flash.verifyImage(image, options);
  }

  async reset(mode = "run") {
    if (mode === "run") {
      await this.adi.writeMem32(0xe000ed0c, 0x05fa0004);
      return { mode: "run", method: "sysresetreq" };
    }
    return { mode };
  }

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
    const adi = this.adi;
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
