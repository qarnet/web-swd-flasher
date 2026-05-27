import { parseNrf52Ficr } from "../../nrf/nrf52-ficr.js";

export class Nrf52Target {
  constructor(adiSession) {
    this.adiSession = adiSession;
  }

  async identify() {
    const dpidr = await this.adiSession.readDpidr();
    let ficr = null;
    try {
      const snapshot = await this.adiSession.readMemBlock(0x10000100, 0x14);
      ficr = parseNrf52Ficr(snapshot, 0x00);
    } catch {
      ficr = null;
    }
    return {
      family: "nRF52",
      part: ficr ? "nRF52 (FICR detected)" : "nRF52 (probe-level detect)",
      dpidr: `0x${dpidr.toString(16)}`,
      ficr
    };
  }
}
