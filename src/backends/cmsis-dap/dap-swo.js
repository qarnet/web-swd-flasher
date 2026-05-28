// DAP_SWO_* commands (CMSIS-DAP v1.3+)
// Requires probe capability bit 2 (SWO UART) or bit 3 (SWO Manchester).
// Gate on hasSWO_UART || hasSWO_Manchester before use.

export class DapSwoSession {
  constructor(dapCore) {
    this.core = dapCore;
    this._polling = false;
    this._pollTimer = null;
    this._onData = null;
  }

  // DAP_SWO_Transport (0x17): 0=none, 1=DAP_SWO_Data, 2=USB CDC
  async setTransport(transport) {
    const resp = await this.core.sendCommand(new Uint8Array([0x17, transport]));
    if (resp[1] !== 0x00) throw new Error(`DAP_SWO_Transport failed: 0x${resp[1].toString(16)}`);
  }

  // DAP_SWO_Mode (0x18): 0=off, 1=UART, 2=Manchester
  async setMode(mode) {
    const resp = await this.core.sendCommand(new Uint8Array([0x18, mode]));
    if (resp[1] !== 0x00) throw new Error(`DAP_SWO_Mode failed: 0x${resp[1].toString(16)}`);
  }

  // DAP_SWO_Baudrate (0x19): set baud rate, returns actual achieved rate
  async setBaudrate(baudRate) {
    const baud = baudRate >>> 0;
    const payload = new Uint8Array([
      0x19,
      baud & 0xff, (baud >>> 8) & 0xff, (baud >>> 16) & 0xff, (baud >>> 24) & 0xff
    ]);
    const resp = await this.core.sendCommand(payload);
    const actual = resp[1] | (resp[2] << 8) | (resp[3] << 16) | (resp[4] << 24);
    return actual >>> 0;
  }

  // DAP_SWO_Control (0x1A): 0=stop, 1=start
  async setControl(start) {
    const resp = await this.core.sendCommand(new Uint8Array([0x1a, start ? 1 : 0]));
    if (resp[1] !== 0x00) throw new Error(`DAP_SWO_Control failed: 0x${resp[1].toString(16)}`);
  }

  // DAP_SWO_Status (0x1B)
  async status() {
    const resp = await this.core.sendCommand(new Uint8Array([0x1b]));
    const active = resp[1] & 0x01;
    const error  = (resp[1] >> 6) & 0x01;
    const overrun = (resp[1] >> 7) & 0x01;
    const count  = resp[2] | (resp[3] << 8) | (resp[4] << 16) | (resp[5] << 24);
    return { active: !!active, error: !!error, overrun: !!overrun, count: count >>> 0 };
  }

  // DAP_SWO_Data (0x1C): read up to `count` bytes from probe buffer
  async readData(count = 64) {
    const payload = new Uint8Array([0x1c, count & 0xff, (count >>> 8) & 0xff]);
    const resp = await this.core.sendCommand(payload);
    const status = resp[1];
    const rxCount = resp[2] | (resp[3] << 8);
    return { status, data: resp.slice(4, 4 + rxCount) };
  }

  async open({ baudRate = 1000000, mode = 1, onData = null, pollIntervalMs = 50 } = {}) {
    await this.setTransport(1);
    await this.setMode(mode);
    const actual = await this.setBaudrate(baudRate);
    await this.setControl(true);
    this._onData = onData;
    this._polling = true;
    this._poll(pollIntervalMs);
    return actual;
  }

  _poll(intervalMs) {
    if (!this._polling) return;
    this._pollTimer = setTimeout(async () => {
      try {
        const st = await this.status();
        if (st.count > 0) {
          const { data } = await this.readData(Math.min(st.count, 512));
          if (this._onData && data.length > 0) this._onData(data);
        }
      } catch { /* ignore poll errors */ }
      this._poll(intervalMs);
    }, intervalMs);
  }

  async close() {
    this._polling = false;
    if (this._pollTimer) clearTimeout(this._pollTimer);
    try {
      await this.setControl(false);
      await this.setMode(0);
      await this.setTransport(0);
    } catch { /* ignore close errors */ }
  }
}
