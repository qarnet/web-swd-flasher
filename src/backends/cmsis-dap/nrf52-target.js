export class Nrf52Target {
  constructor(adiSession) {
    this.adiSession = adiSession;
  }

  async identify() {
    const dpidr = await this.adiSession.readDpidr();
    return {
      family: "nRF52",
      part: "nRF52840 (assumed)",
      dpidr: `0x${dpidr.toString(16)}`
    };
  }
}
