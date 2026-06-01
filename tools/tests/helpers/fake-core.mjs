export class FakeCore {
  constructor(responseMap = {}) {
    this.calls = [];
    this._responseMap = responseMap;
    this.transport = { packetSize: 64, log: null };
    this._reconnectCalled = false;
    this._caps = null;
  }

  async transfer(port, register, value) {
    this.calls.push({ method: "transfer", port, register, value });
    const key = `${port}:${register}:${value === null ? "read" : value}`;
    if (this._responseMap[key] !== undefined) {
      return this._responseMap[key];
    }
    return 0;
  }

  async transferMultiple(ops) {
    const reads = [];
    for (const op of ops) {
      this.calls.push({ method: "transferMultiple", ...op });
      if (op.value === null || op.value === undefined) {
        if (op.port === "dp" && op.register === 0x0c) {
          reads.push(this._responseMap["RDBUFF"] ?? 0);
        } else if (op.port === "ap" && op.register === 0x0c) {
          reads.push(this._responseMap["DRW"] ?? 0);
        } else {
          reads.push(0);
        }
      }
    }
    return reads;
  }

  async transferBlockWrite(port, register, words, offset = 0, count = words.length - offset) {
    this.calls.push({ method: "transferBlockWrite", port, register, count, offset });
    return count;
  }

  async transferBlockRead(port, register, count) {
    this.calls.push({ method: "transferBlockRead", port, register, count });
    const result = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      result[i] = this._responseMap["blockRead"] ?? 0;
    }
    return result;
  }

  async readDp(register) {
    return this.transfer("dp", register, null);
  }

  async writeDp(register, value) {
    return this.transfer("dp", register, value);
  }

  async writeAbort(value = 0x1e) {
    this.calls.push({ method: "writeAbort", value });
  }

  async reconnectSwd() {
    this._reconnectCalled = true;
  }

  async connect() {
    this.calls.push({ method: "connect" });
    return { port: 1, dpidr: 0x0bc10477 };
  }

  async disconnect() {
    this.calls.push({ method: "disconnect" });
  }

  async dapInfo() {
    return {
      protocol: "cmsis-dap",
      transport: "hid",
      vendor: "Test",
      product: "Fake Probe",
      packetSize: 64,
      maxPacketCount: 1,
      maxPacketSize: 64,
      capabilities: 0x11,
      hasSWD: true,
      hasJTAG: false,
      hasSWO_UART: false,
      hasSWO_Manchester: false,
      hasAtomicCommands: true,
      hasTestDomainTimer: false,
      hasSWO_Streaming: false,
      hasUART: false
    };
  }

  async sendCommand(payload) {
    this.calls.push({ method: "sendCommand", cmd: payload[0] });
    const response = new Uint8Array(this.transport.packetSize);
    response[0] = payload[0];
    return response;
  }

  get hasAtomicCommands() {
    return this._caps?.hasAtomicCommands ?? true;
  }
}