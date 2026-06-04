import { WebSerialUart } from "../backends/serial/web-serial-uart.js";
import { Topics } from "./event-bus-topics.js";

export class SerialManager {
  constructor(bus) {
    this._uart = null;
    this._connected = false;
    this._portInfo = null;
    this._baudRate = 115200;
    this._bus = bus;
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
        this._bus.emit(Topics.SERIAL_DATA, { bytes });
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
