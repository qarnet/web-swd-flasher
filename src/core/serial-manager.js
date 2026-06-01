import { WebSerialUart } from "../backends/serial/web-serial-uart.js";

export class SerialManager {
  constructor() {
    this._uart = null;
    this._connected = false;
    this._portInfo = null;
    this._onData = null;
    this._baudRate = 115200;
  }

  static get supported() {
    return WebSerialUart.supported;
  }

  async requestPort(filters) {
    this._uart = new WebSerialUart();
    this._portInfo = await this._uart.requestPort(filters);
    return this._portInfo;
  }

  async getAuthorizedPorts() {
    const temp = new WebSerialUart();
    return temp.getAuthorizedPorts();
  }

  async connect({ baudRate = 115200, dataBits = 8, stopBits = 1, parity = "none", flowControl = "none" } = {}) {
    if (!this._uart) throw new Error("No serial port selected");
    this._baudRate = baudRate;
    await this._uart.open({
      baudRate,
      dataBits,
      stopBits,
      parity,
      flowControl,
      onData: (bytes) => {
        if (this._onData) this._onData(bytes);
      }
    });
    this._connected = true;
  }

  async disconnect() {
    if (this._uart) {
      await this._uart.close();
    }
    this._connected = false;
  }

  async send(data) {
    if (!this._uart) throw new Error("No serial port");
    await this._uart.send(data);
  }

  set onData(fn) {
    this._onData = fn;
  }

  get connected() {
    return this._connected;
  }

  get portInfo() {
    return this._portInfo;
  }

  get baudRate() {
    return this._baudRate;
  }
}