// Cortex-M debug control via DHCSR/DCRSR/DCRDR (ARMv6-M/v7-M)
const DHCSR    = 0xe000edf0;
const DCRSR    = 0xe000edf4;
const DCRDR    = 0xe000edf8;
const DEMCR    = 0xe000edfc;

const DBGKEY   = 0xa05f << 16;
const C_HALT   = 0x0002;
const C_DEBUGEN = 0x0001;
const C_STEP   = 0x0004;
const C_MASKINTS = 0x0008;
const S_HALT   = 1 << 17;
const S_REGRDY = 1 << 16;

export class DapCortex {
  constructor(adiSession) {
    this.adi = adiSession;
  }

  async isHalted() {
    const dhcsr = await this.adi.readMem32(DHCSR);
    return (dhcsr & S_HALT) !== 0;
  }

  async halt() {
    await this.adi.writeMem32(DHCSR, DBGKEY | C_DEBUGEN | C_HALT);
    // Poll until halted (up to 200ms)
    const start = Date.now();
    while (Date.now() - start < 200) {
      if (await this.isHalted()) return;
    }
    throw new Error("Core did not halt within 200ms");
  }

  async resume() {
    const dhcsr = await this.adi.readMem32(DHCSR);
    if ((dhcsr & S_HALT) === 0) return; // already running
    // Clear C_HALT to resume
    await this.adi.writeMem32(DHCSR, DBGKEY | C_DEBUGEN);
  }

  async step() {
    // Ensure halted first
    if (!(await this.isHalted())) await this.halt();
    // Step with interrupts masked
    await this.adi.writeMem32(DHCSR, DBGKEY | C_DEBUGEN | C_STEP | C_MASKINTS);
    const start = Date.now();
    while (Date.now() - start < 200) {
      const dhcsr = await this.adi.readMem32(DHCSR);
      if ((dhcsr & S_HALT) && !(dhcsr & C_STEP)) return;
    }
    throw new Error("Core step did not complete within 200ms");
  }

  async readRegister(regNum) {
    await this.adi.writeMem32(DCRSR, regNum & 0x1f);
    const start = Date.now();
    while (Date.now() - start < 100) {
      const dhcsr = await this.adi.readMem32(DHCSR);
      if (dhcsr & S_REGRDY) return this.adi.readMem32(DCRDR);
    }
    throw new Error("Register read timeout");
  }

  async readCoreRegs() {
    const names = ["r0","r1","r2","r3","r4","r5","r6","r7","r8","r9","r10","r11","r12","sp","lr","pc","xpsr"];
    const regs = {};
    for (let i = 0; i < names.length; i++) {
      regs[names[i]] = await this.readRegister(i);
    }
    return regs;
  }
}
