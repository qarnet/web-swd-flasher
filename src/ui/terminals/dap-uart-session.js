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

  buildControls() {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="dd-row">
        <label class="dd-check-label" style="gap:0.3rem">
          Baud
          <select class="uart-baud-select dd-input">
            <option value="9600">9600</option>
            <option value="19200">19200</option>
            <option value="38400">38400</option>
            <option value="57600">57600</option>
            <option value="115200" selected>115200</option>
            <option value="230400">230400</option>
            <option value="460800">460800</option>
            <option value="921600">921600</option>
          </select>
        </label>
        <div class="dd-actions">
          <button class="btn-uart-connect" type="button" disabled>Connect UART</button>
          <button class="btn-uart-disconnect" type="button" disabled>Disconnect</button>
        </div>
      </div>
      <p class="uart-status" style="margin:0.3rem 0 0;font-size:0.72rem;color:var(--muted)">Not connected</p>
    `;

    this._els = {
      baudSelect:    container.querySelector(".uart-baud-select"),
      btnConnect:    container.querySelector(".btn-uart-connect"),
      btnDisconnect: container.querySelector(".btn-uart-disconnect"),
      status:        container.querySelector(".uart-status"),
    };

    persistInput(this._els.baudSelect, "uart-baud");

    return container;
  }

  init({ rootEl: _rootEl, bus, onData, onReadyChange }) {
    this._onData = onData;
    this._onReadyChange = onReadyChange;

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
