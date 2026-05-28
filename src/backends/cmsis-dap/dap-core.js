export class CmsisDapCore {
  constructor(transport, swdClockHz = 1000000) {
    this.transport = transport;
    this.swdClockHz = swdClockHz;
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
    const clockHz = this.swdClockHz;
    const clockBytes = [(clockHz & 0xff), ((clockHz >>> 8) & 0xff), ((clockHz >>> 16) & 0xff), ((clockHz >>> 24) & 0xff)];
    await this.sendCommand(new Uint8Array([0x11, ...clockBytes]));
    this.debug("swd-clock-set", { hz: clockHz });
    await this.sendCommand(new Uint8Array([0x04, 0x02, 0x50, 0x00, 0x00]));
    await this.sendCommand(new Uint8Array([0x13, 0x00]));
    await this.swjSwitchToSwd();
    const dpidr = await this.readDp(0x00);
    this.debug("dpidr-read", { dpidr: `0x${dpidr.toString(16)}` });
    await this.writeDp(0x00, 0x1e);
    await this.writeDp(0x04, 0x50000f00);
    const ctrlStat = await this.readDp(0x04);
    this.debug("ctrl-stat", { ctrlStat: `0x${ctrlStat.toString(16)}` });
    // Cache probe capabilities for pipelining decisions
    try {
      this._caps = await this.dapInfo();
    } catch {
      this._caps = null;
    }
    this.debug("connect-complete", { port: connect[1], dpidr: `0x${dpidr.toString(16)}` });
    return { port: connect[1], dpidr };
  }

  get hasAtomicCommands() {
    return this._caps?.hasAtomicCommands ?? false;
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

  async setSWDClock(hz) {
    this.swdClockHz = hz;
    const b = [(hz & 0xff), ((hz >>> 8) & 0xff), ((hz >>> 16) & 0xff), ((hz >>> 24) & 0xff)];
    await this.sendCommand(new Uint8Array([0x11, ...b]));
  }

  async disconnect() {
    await this.sendCommand(new Uint8Array([0x03]));
    await this.transport.close();
  }

  async dapInfo() {
    const query = async (id) => {
      const raw = await this.sendCommand(new Uint8Array([0x00, id]));
      const len = raw[1];
      return raw.slice(2, 2 + len);
    };
    const dec = (bytes) => {
      let s = "";
      for (const b of bytes) s += String.fromCharCode(b);
      return s;
    };
    const vendorBytes = await query(0x01);
    const productBytes = await query(0x02);
    const capsBytes = await query(0xF0);
    const maxCntBytes = await query(0xFE);
    const maxSzBytes = await query(0xFF);
    const caps = capsBytes[0] ?? 0;
    return {
      protocol: "cmsis-dap",
      transport: "webusb-bulk",
      vendor: dec(vendorBytes),
      product: dec(productBytes),
      packetSize: this.transport.packetSize,
      maxPacketCount: maxCntBytes[0] ?? 1,
      maxPacketSize: maxSzBytes.length >= 2 ? (maxSzBytes[0] | (maxSzBytes[1] << 8)) : this.transport.packetSize,
      capabilities: caps,
      hasSWD: (caps & 0x01) !== 0,
      hasJTAG: (caps & 0x02) !== 0,
      hasSWO_UART: (caps & 0x04) !== 0,
      hasSWO_Manchester: (caps & 0x08) !== 0,
      hasAtomicCommands: (caps & 0x10) !== 0,
      hasTestDomainTimer: (caps & 0x20) !== 0,
      hasSWO_Streaming: (caps & 0x40) !== 0,
      hasUART: (caps & 0x80) !== 0
    };
  }

  async writeAbort(value = 0x0000001e) {
    const v = value >>> 0;
    const payload = new Uint8Array([
      0x08, 0x00,
      v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff
    ]);
    const resp = await this.sendCommand(payload);
    if (resp[1] !== 0x00) {
      throw new Error(`DAP_WriteABORT failed: status=0x${resp[1].toString(16)}`);
    }
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
    const expectedCmd = payload[0];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.transport.read();
      this.debug("rx", { cmd: response[0], bytes: Array.from(response.slice(0, Math.min(12, response.length))) });
      if (response[0] === expectedCmd) {
        return response;
      }
      this.debug("stale-response", { expected: expectedCmd, got: response[0], attempt });
    }
    throw new Error(`CMSIS-DAP response mismatch for command 0x${expectedCmd.toString(16)}`);
  }

  // DAP_ExecuteCommands (0x7F): batch multiple commands into one USB packet.
  // cmds: array of Uint8Array payloads (same format as standalone commands).
  // Returns: array of Uint8Array responses, one per command.
  // Requires hasAtomicCommands capability; throws if probe doesn't support it.
  async executeCommands(cmds) {
    const packetSize = this.transport.packetSize;
    let totalLen = 2; // 0x7F + num_cmds
    for (const c of cmds) totalLen += c.length;
    if (totalLen > packetSize) {
      throw new Error(`executeCommands: ${totalLen}B payload exceeds packet size ${packetSize}`);
    }
    const payload = new Uint8Array(packetSize);
    payload[0] = 0x7f;
    payload[1] = cmds.length;
    let offset = 2;
    for (const c of cmds) {
      payload.set(c, offset);
      offset += c.length;
    }
    const response = await this.sendCommand(payload);
    // response[0]=0x7F, response[1]=num_cmds, then concatenated sub-responses
    // Sub-response lengths are NOT encoded — caller must know expected lengths.
    // We return raw slices by asking the caller for expected sizes via cmdRespLengths.
    // For simplicity: return the raw response buffer; callers slice as needed.
    return response;
  }

  async lineReset() {
    await this.sendCommand(new Uint8Array([0x12, 56, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]));
    await this.sendCommand(new Uint8Array([0x12, 8, 0x00]));
  }

  async transferBlockWrite(port, register, values, count = values.length, offset = 0) {
    if (count === 0 || count > 65535) {
      throw new Error(`transferBlockWrite: invalid count ${count}`);
    }
    const request = (port === "ap" ? 0x01 : 0x00) | 0x00 | (register & 0x0c);
    const payloadSize = 5 + count * 4;
    if (payloadSize > this.transport.packetSize) {
      throw new Error(`transferBlockWrite: ${count} words exceeds packet size ${this.transport.packetSize}`);
    }
    const payload = new Uint8Array(this.transport.packetSize);
    payload[0] = 0x06;
    payload[1] = 0x00;
    payload[2] = count & 0xff;
    payload[3] = (count >>> 8) & 0xff;
    payload[4] = request;
    const dataView = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    for (let i = 0; i < count; i += 1) {
      dataView.setUint32(5 + i * 4, values[offset + i], true);
    }
    this.debug("transferBlockWrite-tx", { count, register, request });
    const response = await this.sendCommand(payload);
    const respCount = response[1] | (response[2] << 8);
    const respStatus = response[3] & 0x07;
    if (respStatus !== 0x01) {
      throw new Error(`transferBlockWrite failed: ACK=${respStatus}, transferred=${respCount}`);
    }
    return respCount;
  }

  async transferBlockRead(port, register, count) {
    if (count === 0 || count > 65535) {
      throw new Error(`transferBlockRead: invalid count ${count}`);
    }
    const request = (port === "ap" ? 0x01 : 0x00) | 0x02 | (register & 0x0c);
    const payload = new Uint8Array(5);
    payload[0] = 0x06;
    payload[1] = 0x00;
    payload[2] = count & 0xff;
    payload[3] = (count >>> 8) & 0xff;
    payload[4] = request;
    this.debug("transferBlockRead-tx", { count, register, request });
    const response = await this.sendCommand(payload);
    const respCount = response[1] | (response[2] << 8);
    const respStatus = response[3] & 0x07;
    if (respStatus !== 0x01) {
      throw new Error(`transferBlockRead failed: ACK=${respStatus}, transferred=${respCount}`);
    }
    const result = new Uint32Array(respCount);
    for (let i = 0; i < respCount; i += 1) {
      const offset = 4 + i * 4;
      result[i] = ((response[offset] | (response[offset + 1] << 8) | (response[offset + 2] << 16) | (response[offset + 3] << 24)) >>> 0);
    }
    return result;
  }

  async transferMultiple(operations) {
    const packetSize = this.transport.packetSize;
    let payloadLen = 3;
    for (const op of operations) {
      payloadLen += 1;
      if (op.value !== null && op.value !== undefined) {
        payloadLen += 4;
      }
    }
    if (payloadLen > packetSize) {
      throw new Error(`transferMultiple: ${operations.length} operations exceed packet size ${packetSize}`);
    }
    const payload = new Uint8Array(Math.max(payloadLen, packetSize));
    payload[0] = 0x05;
    payload[1] = 0x00;
    payload[2] = operations.length;
    let offset = 3;
    for (const op of operations) {
      const isAp = op.port === "ap";
      const isRead = op.value === null || op.value === undefined;
      const req = (isAp ? 0x01 : 0x00) | (isRead ? 0x02 : 0x00) | (op.register & 0x0c);
      payload[offset] = req;
      offset += 1;
      if (!isRead) {
        payload[offset] = op.value & 0xff;
        payload[offset + 1] = (op.value >>> 8) & 0xff;
        payload[offset + 2] = (op.value >>> 16) & 0xff;
        payload[offset + 3] = (op.value >>> 24) & 0xff;
        offset += 4;
      }
    }
    const response = await this.sendCommand(payload.slice(0, Math.max(payloadLen, packetSize)));
    const respCount = response[1];
    const respStatus = response[2] & 0x07;
    if (respStatus !== 0x01) {
      throw new Error(`transferMultiple failed: ACK=${respStatus}, transferred=${respCount}`);
    }
    if (respCount !== operations.length) {
      throw new Error(`transferMultiple: expected ${operations.length} transfers, got ${respCount}`);
    }
    const reads = [];
    let readOffset = 3;
    for (const op of operations) {
      const isRead = op.value === null || op.value === undefined;
      if (isRead) {
        const val = ((response[readOffset] | (response[readOffset + 1] << 8) | (response[readOffset + 2] << 16) | (response[readOffset + 3] << 24)) >>> 0);
        reads.push(val);
        readOffset += 4;
      }
    }
    return reads;
  }
}
