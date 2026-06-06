export class WebSerialUart {
  constructor() {
    this._port = null;
    this._reader = null;
    this._writer = null;
    this._readableClosed = null;
    this._writableClosed = null;
    this._onData = null;
    this._reading = false;
    this._connected = false;
  }

  static get supported() {
    return "serial" in navigator;
  }

  async requestPort(filters) {
    const options = filters ? { filters } : {};
    this._port = await navigator.serial.requestPort(options);
    return this._port.getInfo();
  }

  async getAuthorizedPorts() {
    const ports = await navigator.serial.getPorts();
    return ports.map(p => p.getInfo());
  }

  async useAuthorizedPort() {
    const ports = await navigator.serial.getPorts();
    if (ports.length === 0) return null;
    this._port = ports[0];
    return this._port.getInfo();
  }

  async open({ baudRate = 115200, dataBits = 8, stopBits = 1, parity = "none", flowControl = "none", onData = null } = {}) {
    if (!this._port) throw new Error("No serial port selected — call requestPort() first");
    await this._port.open({ baudRate, dataBits, stopBits, parity, flowControl });
    this._connected = true;
    this._onData = onData;
    this._startReading();
  }

  async _startReading() {
    if (!this._port?.readable || this._reading) return;
    this._reading = true;
    try {
      this._reader = this._port.readable.getReader();
      while (this._reading && this._port.readable) {
        const { value, done } = await this._reader.read();
        if (done) break;
        if (value && this._onData) {
          this._onData(value);
        }
      }
    } catch (err) {
      if (this._reading) {
        this._reading = false;
      }
    } finally {
      if (this._reader) {
        try { this._reader.releaseLock(); } catch { /* already released */ }
        this._reader = null;
      }
      this._reading = false;
    }
  }

  async send(data) {
    if (!this._port?.writable) throw new Error("Serial port not open");
    const writer = this._port.writable.getWriter();
    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }
  }

  async close() {
    this._reading = false;
    if (this._reader) {
      try { await this._reader.cancel(); } catch { /* ignore */ }
      try { this._reader.releaseLock(); } catch { /* ignore */ }
      this._reader = null;
    }
    if (this._readableClosed) {
      try { await this._readableClosed; } catch { /* ignore */ }
      this._readableClosed = null;
    }
    if (this._writableClosed) {
      try { await this._writableClosed; } catch { /* ignore */ }
      this._writableClosed = null;
    }
    if (this._port) {
      try { await this._port.close(); } catch { /* ignore */ }
    }
    this._connected = false;
    this._onData = null;
  }

  get connected() {
    return this._connected;
  }

  get info() {
    if (!this._port) return null;
    return this._port.getInfo();
  }
}