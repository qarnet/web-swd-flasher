export class Nrf52Recovery {
  static CTRL_AP = 1;
  static REG_RESET = 0x000;
  static REG_ERASEALL = 0x004;
  static REG_ERASEALLSTATUS = 0x008;
  static REG_APPROTECTSTATUS = 0x00c;

  constructor(adi) {
    this.adi = adi;
  }

  async checkProtection() {
    await this.adi.selectAp(Nrf52Recovery.CTRL_AP, 0);
    const status = await this.adi.readAp(Nrf52Recovery.REG_APPROTECTSTATUS);
    await this.adi.selectAp(0, 0);
    return { locked: status === 0, apProtectStatus: status };
  }

  async eraseAll(onProgress = null) {
    await this.adi.selectAp(Nrf52Recovery.CTRL_AP, 0);
    await this.adi.writeAp(Nrf52Recovery.REG_ERASEALL, 1);
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const busy = await this.adi.readAp(Nrf52Recovery.REG_ERASEALLSTATUS);
      if (onProgress) onProgress({ busy: busy !== 0 });
      if (busy === 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const protStatus = await this.adi.readAp(Nrf52Recovery.REG_APPROTECTSTATUS);
    // Assert reset, hold briefly, then deassert so the CPU actually boots.
    await this.adi.writeAp(Nrf52Recovery.REG_RESET, 1);
    await new Promise(r => setTimeout(r, 50));
    await this.adi.writeAp(Nrf52Recovery.REG_RESET, 0);
    // Re-initialize the SWD connection so the device is immediately
    // reachable for programming without a replug.
    await this.adi.reconnectSwd();
    return { unlocked: protStatus !== 0 };
  }
}
