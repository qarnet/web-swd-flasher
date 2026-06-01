export class FakeTransport {
  constructor(responses = [], packetSize = 64) {
    this.packetSize = packetSize;
    this._queue = [...responses];
    this._written = [];
    this._open = false;
  }

  async open() {
    this._open = true;
  }

  async close() {
    this._open = false;
  }

  async write(payload) {
    this._written.push(payload);
  }

  async read() {
    if (this._queue.length === 0) {
      throw new Error("FakeTransport: read queue empty");
    }
    return this._queue.shift();
  }

  enqueue(...responses) {
    this._queue.push(...responses);
  }

  get lastWrite() {
    return this._written[this._written.length - 1];
  }

  get writtenCount() {
    return this._written.length;
  }

  reset() {
    this._queue.length = 0;
    this._written.length = 0;
  }
}

export class SmartFakeTransport {
  constructor(packetSize = 64) {
    this.packetSize = packetSize;
    this.commands = [];
    this.frames = [];
    this._open = false;
  }

  async open() {
    this._open = true;
  }

  async close() {
    this._open = false;
  }

  async write(frame) {
    this.commands.push(frame[0]);
    this.frames.push(frame);
  }

  async read() {
    const cmd = this.commands[this.commands.length - 1];
    const response = new Uint8Array(this.packetSize);
    response[0] = cmd;
    if (cmd === 0x02) {
      response[1] = 0x01;
    } else if (cmd === 0x05) {
      response[1] = 0x01;
      response[2] = 0x01;
      response[3] = 0x00;
      response[4] = 0x00;
      response[5] = 0x00;
      response[6] = 0xa0;
    } else if (cmd === 0x06) {
      response[1] = 0x03;
      response[2] = 0x00;
      response[3] = 0x01;
    } else if (cmd === 0x00) {
      response[1] = 0x08;
      response[2] = 0x04;
      response[3] = 0xC2;
      response[4] = 0x4E;
    }
    return response;
  }
}