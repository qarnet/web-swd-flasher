import { Topics } from "../../core/event-bus-topics.js";
import { TerminalSession } from "./terminal-session.js";

export class SerialSession extends TerminalSession {
  constructor({ serialManager }) {
    super();
    this._serialManager = serialManager;
    this._firstChunk = true;
    this._onData = null;
    this._onReadyChange = null;
  }

  get channelId() { return "serial"; }

  isReady() { return this._serialManager.connected; }

  async sendRaw(bytes) {
    await this._serialManager.send(bytes);
  }

  init({ bus, onData, onReadyChange }) {
    this._onData = onData;
    this._onReadyChange = onReadyChange;
    this._firstChunk = true;

    const unsubData = bus.on(Topics.SERIAL_DATA, ({ bytes }) => {
      if (this._firstChunk) { this._firstChunk = false; this._onData?.(new TextEncoder().encode("\n")); }
      this._onData?.(bytes);
    });
    const unsubConnected    = bus.on(Topics.SERIAL_CONNECTED,    () => { this._firstChunk = true;  this._onReadyChange?.(); });
    const unsubDisconnected = bus.on(Topics.SERIAL_DISCONNECTED, () => { this._onReadyChange?.(); });

    return () => { unsubData(); unsubConnected(); unsubDisconnected(); };
  }
}
