export class CmsisDapCore {
  constructor(transport) {
    this.transport = transport;
  }

  debug(message, payload = null) {
    if (typeof this.transport?.debug === "function") {
      this.transport.debug(`[dap-core] ${message}`, payload);
    }
  }

  async connect() {
    await this.transport.open();
    this.debug("connect-start");
    const connect = await this.sendCommand(new Uint8Array([0x02, 0x01]));
    if (connect[1] === 0) {
      throw new Error("CMSIS-DAP connect returned no active port");
    }
    await this.sendCommand(new Uint8Array([0x11, 0xa0, 0x86, 0x01, 0x00]));
    await this.sendCommand(new Uint8Array([0x04, 0x02, 0x50, 0x00, 0x00]));
    await this.sendCommand(new Uint8Array([0x13, 0x00]));
    await this.swjSwitchToSwd();
    const dpidr = await this.readDp(0x00);
    this.debug("dpidr-read", { dpidr: `0x${dpidr.toString(16)}` });
    await this.writeDp(0x00, 0x1e);
    await this.writeDp(0x04, 0x50000f00);
    const ctrlStat = await this.readDp(0x04);
    this.debug("ctrl-stat", { ctrlStat: `0x${ctrlStat.toString(16)}` });
    this.debug("connect-complete", { port: connect[1], dpidr: `0x${dpidr.toString(16)}` });
    return { port: connect[1], dpidr };
  }

  async readDp(register) {
    return this.transfer("dp", register, null);
  }

  async writeDp(register, value) {
    return this.transfer("dp", register, value);
  }

  async swjSwitchToSwd() {
    await this.sendCommand(new Uint8Array([0x12, 56, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]));
    await this.sendCommand(new Uint8Array([0x12, 16, 0x9e, 0xe7]));
    await this.sendCommand(new Uint8Array([0x12, 56, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]));
    await this.sendCommand(new Uint8Array([0x12, 8, 0x00]));
    this.debug("swj-switch-to-swd-complete");
  }

  async disconnect() {
    await this.sendCommand(new Uint8Array([0x03]));
    await this.transport.close();
  }

  async dapInfo() {
    const raw = await this.sendCommand(new Uint8Array([0x00, 0x04]));
    const caps = raw[1];
    return {
      protocol: "cmsis-dap",
      transport: "webusb-bulk",
      packetSize: this.transport.packetSize,
      capabilities: caps
    };
  }

  async transfer(port, register, value = null) {
    const request = port === "ap" ? 0x01 : 0x00;
    const read = value === null;
    const req = request | (read ? 0x02 : 0x00) | (register & 0x0c);

    const payload = [0x05, 0x00, 0x01, req];
    if (!read) {
      payload.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
    }

    let response = null;
    let ack = 0;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      response = await this.sendCommand(new Uint8Array(payload));
      ack = response[2] & 0x07;
      if (ack === 0x01) {
        break;
      }
      this.debug("transfer-ack-retry", { attempt, ack, port, register, read });
      if (ack === 0x02) {
        await this.lineReset();
        continue;
      }
      if (ack === 0x07) {
        await this.swjSwitchToSwd();
        continue;
      }
      break;
    }

    if (ack !== 0x01) {
      throw new Error(
        `CMSIS-DAP transfer failed with ACK=${ack} port=${port} register=0x${register.toString(16)} read=${read}`
      );
    }

    if (read) {
      return (response[3] | (response[4] << 8) | (response[5] << 16) | (response[6] << 24)) >>> 0;
    }
    return 0;
  }

  async sendCommand(payload) {
    this.debug("tx", { cmd: payload[0], bytes: Array.from(payload.slice(0, Math.min(12, payload.length))) });
    await this.transport.write(payload);
    const response = await this.transport.read();
    this.debug("rx", { cmd: response[0], bytes: Array.from(response.slice(0, Math.min(12, response.length))) });
    if (response[0] !== payload[0]) {
      throw new Error(`CMSIS-DAP response mismatch for command 0x${payload[0].toString(16)}`);
    }
    return response;
  }

  async lineReset() {
    await this.sendCommand(new Uint8Array([0x12, 56, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]));
    await this.sendCommand(new Uint8Array([0x12, 8, 0x00]));
  }
}
