import { Topics } from "../../core/event-bus-topics.js";
import { TerminalSession } from "./terminal-session.js";

/**
 * SerialSession delegates connection management to SerialConnectionPanel
 * (which lives in the nav bar). This session only handles the data path.
 */
export class SerialSession extends TerminalSession {
  constructor({ serialManager }) {
    super();
    this._serialManager = serialManager;
    this._firstChunk = true;
    this._onData = null;
    this._onReadyChange = null;
  }

  get channelId() { return "serial"; }

  // The serial log pre has a non-standard ID due to "serial-log" being taken by event log.
  get logSelector() { return "#serial-term-log"; }

  isReady() { return this._serialManager.connected; }

  async send(text) {
    await this._serialManager.send(new TextEncoder().encode(text + "\r\n"));
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
