export class CmsisDapCore {
  constructor(transport) {
    this.transport = transport;
  }

  async connect() {
    await this.transport.open();
    const connect = await this.sendCommand(new Uint8Array([0x02, 0x01]));
    if (connect[1] === 0) {
      throw new Error("CMSIS-DAP connect returned no active port");
    }
    await this.sendCommand(new Uint8Array([0x11, 0x40, 0x42, 0x0f, 0x00]));
    await this.sendCommand(new Uint8Array([0x04, 0x02, 0x50, 0x00, 0x00]));
    await this.sendCommand(new Uint8Array([0x13, 0x00]));

    await this.sendCommand(
      new Uint8Array([0x12, 56, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
    );
    await this.sendCommand(new Uint8Array([0x12, 16, 0x9e, 0xe7]));
    await this.sendCommand(
      new Uint8Array([0x12, 56, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
    );
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

    const response = await this.sendCommand(new Uint8Array(payload));
    const ack = response[2] & 0x07;
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
    await this.transport.write(payload);
    const response = await this.transport.read();
    if (response[0] !== payload[0]) {
      throw new Error(`CMSIS-DAP response mismatch for command 0x${payload[0].toString(16)}`);
    }
    return response;
  }
}
