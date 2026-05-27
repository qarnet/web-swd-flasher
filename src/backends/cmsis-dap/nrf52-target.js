export class Nrf52Target {
  constructor(adiSession) {
    this.adiSession = adiSession;
  }

  async identify() {
    const dpidr = await this.adiSession.readDpidr();
    return {
      family: "nRF52",
      part: "nRF52 (probe-level detect)",
      dpidr: `0x${dpidr.toString(16)}`
    };
  }
}
