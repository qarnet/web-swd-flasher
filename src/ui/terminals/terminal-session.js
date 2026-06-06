export class TerminalSession {
  get channelId() { throw new Error("TerminalSession.channelId not implemented"); }

  isReady() { return false; }

  init({ rootEl, bus, backendProvider, onData, onReadyChange }) { return () => {}; }

  async sendRaw(bytes) { throw new Error("TerminalSession.sendRaw not implemented"); }

  async sendLine(text) {
    await this.sendRaw(new TextEncoder().encode(`${text}\r\n`));
  }

  async send(text) { return this.sendLine(text); }
}
