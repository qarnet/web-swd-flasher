export class CmsisDapCore {
  constructor(transport) {
    this.transport = transport;
  }

  async connect() {
    await this.transport.open();
  }

  async disconnect() {
    await this.transport.close();
  }

  async dapInfo() {
    return {
      protocol: "cmsis-dap",
      transport: "webusb-bulk",
      packetSize: this.transport.packetSize
    };
  }
}
