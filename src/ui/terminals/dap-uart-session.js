import { Topics } from "../../core/event-bus-topics.js";
import { persistInput } from "../components/persist-input.js";
import { DapUartSession as DapUartSessionBackend } from "../../backends/cmsis-dap/dap-uart.js";
import { TerminalSession } from "./terminal-session.js";

export class DapUartTerminalSession extends TerminalSession {
  constructor({ backendProvider, logger }) {
    super();
    this._backendProvider = backendProvider;
    this._logger = logger;
    this._uart = null;
    this._els = null;
    this._onReadyChange = null;
    this._onData = null;
  }

  get channelId() { return "uart"; }

  isReady() { return this._uart != null; }

  async sendRaw(bytes) {
    if (!this._uart) throw new Error("UART not connected");
    await this._uart.send(bytes);
  }

  init({ rootEl, bus, onData, onReadyChange }) {
    this._onData = onData;
    this._onReadyChange = onReadyChange;

    this._els = {
      baudSelect:     rootEl.querySelector("#uart-baud-select"),
      btnConnect:     rootEl.querySelector("#btn-uart-connect"),
      btnDisconnect:  rootEl.querySelector("#btn-uart-disconnect"),
      btnDownload:    rootEl.querySelector("#btn-uart-download"),
      status:         rootEl.querySelector("#uart-status"),
    };

    persistInput(this._els.baudSelect, "uart-baud");

    this._els.btnConnect.addEventListener("click",    this._onConnect);
    this._els.btnDisconnect.addEventListener("click", this._onDisconnect);
    this._els.btnConnect.disabled    = true;
    this._els.btnDisconnect.disabled = true;

    const unsubConnected    = bus.on(Topics.BACKEND_CONNECTED,    () => { this._els.btnConnect.disabled = false; });
    const unsubDisconnected = bus.on(Topics.BACKEND_DISCONNECTED, () => {
      this._disconnect();
      this._els.btnConnect.disabled    = true;
      this._els.btnDisconnect.disabled = true;
    });

    return () => {
      unsubConnected();
      unsubDisconnected();
      this._els.btnConnect.removeEventListener("click",    this._onConnect);
      this._els.btnDisconnect.removeEventListener("click", this._onDisconnect);
      this._disconnect();
      this._els = null;
    };
  }

  _disconnect() {
    if (this._uart) {
      try { this._uart.close(); } catch {}
      this._uart = null;
    }
    if (this._els) {
      this._els.status.textContent = "Disconnected";
      this._els.btnConnect.disabled    = false;
      this._els.btnDisconnect.disabled = true;
    }
    this._onReadyChange?.();
  }

  _onConnect = async () => {
    const backend = this._backendProvider();
    if (!backend?.core) {
      if (this._els) this._els.status.textContent = "UART not available on this backend";
      return;
    }
    const baudRate = parseInt(this._els.baudSelect.value, 10) || 115200;
    this._els.status.textContent = `Opening UART at ${baudRate} baud...`;
    try {
      this._uart = new DapUartSessionBackend(backend.core);
      await this._uart.open({
        baudRate,
        onData: (bytes) => { this._onData?.(bytes); },
      });
      this._els.status.textContent = `Connected at ${baudRate} baud`;
      this._logger?.log(`DAP UART connected at ${baudRate} baud`);
      this._els.btnConnect.disabled    = true;
      this._els.btnDisconnect.disabled = false;
      this._onReadyChange?.();
    } catch (err) {
      this._els.status.textContent = `UART open failed: ${err.message}`;
      this._logger?.log(`DAP UART open failed: ${err.message}`);
      this._uart = null;
    }
  };

  _onDisconnect = async () => {
    this._disconnect();
    this._logger?.log("DAP UART disconnected");
  };
}
