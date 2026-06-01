// DAP_UART_* commands (CMSIS-DAP v2.1)
// Requires probe capability bit 7 (UART Port) — gate on hasUART before use.

export class DapUartSession {
  constructor(dapCore) {
    this.core = dapCore;
  }

  // DAP_UART_Transport (0x1F) — select USB CDC or DAP UART mode
  // transport: 0 = none (off), 1 = USB CDC, 2 = DAP UART commands
  async setTransport(transport) {
    const resp = await this.core.sendCommand(new Uint8Array([0x1f, transport]));
    if (resp[1] !== 0x00) throw new Error(`DAP_UART_Transport failed: 0x${resp[1].toString(16)}`);
  }

  // DAP_UART_Configure (0x20) — set baud/format
  // baudRate: e.g. 115200
  // dataBits: 5-9 (default 8)
  // parity: 1=none, 2=odd, 3=even, 4=mark, 5=space (default 1)
  // stopBits: 1=1, 2=1.5, 3=2 (default 1)
  async configure({ baudRate = 115200, dataBits = 8, parity = 1, stopBits = 1 } = {}) {
    const baud = baudRate >>> 0;
    const payload = new Uint8Array([
      0x20,
      baud & 0xff, (baud >>> 8) & 0xff, (baud >>> 16) & 0xff, (baud >>> 24) & 0xff,
      dataBits,
      parity,
      stopBits
    ]);
    const resp = await this.core.sendCommand(payload);
    if (resp[1] !== 0x00) throw new Error(`DAP_UART_Configure failed: 0x${resp[1].toString(16)}`);
  }

  // DAP_UART_Control (0x22) — enable/disable RX/TX
  // control: bit0=RX enable, bit1=TX enable
  async control(rxEnable = true, txEnable = true) {
    const ctrl = (rxEnable ? 0x01 : 0x00) | (txEnable ? 0x02 : 0x00);
    const resp = await this.core.sendCommand(new Uint8Array([0x22, ctrl]));
    if (resp[1] !== 0x00) throw new Error(`DAP_UART_Control failed: 0x${resp[1].toString(16)}`);
  }

  // DAP_UART_Status (0x23) — get RX/TX buffer levels and error flags
  async status() {
    const resp = await this.core.sendCommand(new Uint8Array([0x23]));
    const rxError = resp[1] & 0x0f;
    const txError = (resp[1] >> 4) & 0x0f;
    const rxCount = resp[2] | (resp[3] << 8);
    const txCount = resp[4] | (resp[5] << 8);
    return { rxError, txError, rxCount, txCount };
  }

  // DAP_UART_Transfer (0x21) — send/receive data
  // txData: Uint8Array to send (may be empty for rx-only)
  // rxRequestCount: number of bytes to read from probe RX buffer
  async transfer(txData = new Uint8Array(0), rxRequestCount = 0) {
    const payloadLen = 3 + txData.length;
    const payload = new Uint8Array(payloadLen);
    payload[0] = 0x21;
    payload[1] = rxRequestCount & 0xff;
    payload[2] = txData.length & 0xff;
    payload.set(txData, 3);
    const resp = await this.core.sendCommand(payload);
    const txCount = resp[1];
    const rxCount = resp[2];
    return {
      txCount,
      rxData: resp.slice(3, 3 + rxCount)
    };
  }

  // High-level: open session, configure, start polling
  async open({ baudRate = 115200, onData = null, pollIntervalMs = 20 } = {}) {
    await this.setTransport(2);       // DAP UART mode
    await this.configure({ baudRate });
    await this.control(true, true);
    this._onData = onData;
    this._polling = true;
    this._poll(pollIntervalMs);
  }

  _poll(intervalMs) {
    if (!this._polling) return;
    this._pollTimer = setTimeout(async () => {
      try {
        const st = await this.status();
        if (st.rxCount > 0) {
          const { rxData } = await this.transfer(new Uint8Array(0), st.rxCount);
          if (this._onData && rxData.length > 0) {
            this._onData(rxData);
          }
        }
      } catch { /* ignore errors during poll */ }
      this._poll(intervalMs);
    }, intervalMs);
  }

  async close() {
    this._polling = false;
    if (this._pollTimer) clearTimeout(this._pollTimer);
    try {
      await this.control(false, false);
      await this.setTransport(0);
    } catch { /* ignore close errors */ }
  }

  async send(data) {
    await this.transfer(data, 0);
  }
}
