import { Topics } from "../../core/event-bus-topics.js";
import { AnsiRenderer } from "../ansi-renderer.js";
import { downloadLog, autoScrollObserver } from "../log-panel-helpers.js";
import { persistInput } from "../components/persist-input.js";
import { BasePanel } from "../panels/base-panel.js";
import { DapUartSession } from "../../backends/cmsis-dap/dap-uart.js";

export class SwdUartPanel extends BasePanel {
  constructor({ bus, backendProvider, logger }) {
    super();
    this._bus = bus;
    this._backendProvider = backendProvider;
    this._logger = logger;
    this._els = null;
    this._uart = null;
    this._ansiRenderer = null;
  }

  mount(rootEl) {
    this._els = {
      baudSelect: rootEl.querySelector("#uart-baud-select"),
      btnConnect: rootEl.querySelector("#btn-uart-connect"),
      btnDisconnect: rootEl.querySelector("#btn-uart-disconnect"),
      btnClear: rootEl.querySelector("#btn-uart-clear"),
      btnDownload: rootEl.querySelector("#btn-uart-download"),
      chkAutoScroll: rootEl.querySelector("#chk-uart-autoscroll"),
      status: rootEl.querySelector("#uart-status"),
      log: rootEl.querySelector("#uart-log"),
      txInput: rootEl.querySelector("#uart-tx-input"),
      btnSend: rootEl.querySelector("#btn-uart-send"),
    };
    if (!this._els.baudSelect || !this._els.btnConnect) {
      throw new Error("SwdUartPanel: missing required DOM nodes under root");
    }

    this._ansiRenderer = new AnsiRenderer();
    autoScrollObserver(this._els.log, this._els.chkAutoScroll);
    persistInput(this._els.baudSelect, "uart-baud");

    this._bindDomListener(this._els.btnConnect, "click", this._onConnect);
    this._bindDomListener(this._els.btnDisconnect, "click", this._onDisconnect);
    this._bindDomListener(this._els.btnClear, "click", this._onClear);
    this._bindDomListener(this._els.btnDownload, "click", this._onDownload);
    this._bindDomListener(this._els.btnSend, "click", this._onSend);

    this._bindBusListener(this._bus, Topics.BACKEND_CONNECTED, () => {
      this._els.btnConnect.disabled = false;
    });
    this._bindBusListener(this._bus, Topics.BACKEND_DISCONNECTED, () => {
      this._disconnectUart();
      this._els.btnConnect.disabled = true;
      this._els.btnDisconnect.disabled = true;
    });

    this._els.btnConnect.disabled = true;
    this._els.btnDisconnect.disabled = true;
  }

  unmount() {
    if (!this._els) return;
    this._disconnectUart();
    this._teardown();
    this._els = null;
  }

  _disconnectUart() {
    if (this._uart) {
      try { this._uart.close(); } catch {}
      this._uart = null;
    }
    if (this._els) {
      this._els.status.textContent = "Disconnected";
      this._els.btnConnect.disabled = false;
      this._els.btnDisconnect.disabled = true;
    }
  }

  _onConnect = async () => {
    const backend = this._backendProvider();
    if (!backend) return;

    // Get the core from the backend to create DapUartSession
    const core = backend.core;
    if (!core) {
      this._els.status.textContent = "UART not available on this backend";
      return;
    }

    // Check probe has UART capability
    if (backend.getProbeInfo) {
      try {
        const probe = await backend.getProbeInfo();
        if (!probe.hasUART) {
          this._els.status.textContent = "Probe does not support DAP UART";
          return;
        }
      } catch {}
    }

    const baudRate = parseInt(this._els.baudSelect.value, 10) || 115200;
    this._els.status.textContent = `Opening UART at ${baudRate} baud...`;

    try {
      this._uart = new DapUartSession(core);
      await this._uart.open({
        baudRate,
        onData: (bytes) => {
          const text = new TextDecoder().decode(bytes);
          this._ansiRenderer.write(this._els.log, text);
        },
      });
      this._els.status.textContent = `Connected at ${baudRate} baud`;
      this._logger.log(`DAP UART connected at ${baudRate} baud`);
      this._els.btnConnect.disabled = true;
      this._els.btnDisconnect.disabled = false;
    } catch (err) {
      this._els.status.textContent = `UART open failed: ${err.message}`;
      this._logger.log(`DAP UART open failed: ${err.message}`);
    }
  };

  _onDisconnect = async () => {
    this._disconnectUart();
    this._logger.log("DAP UART disconnected");
  };

  _onClear = () => {
    this._els.log.textContent = "";
    if (this._ansiRenderer) this._ansiRenderer.reset();
  };

  _onDownload = () => {
    if (!this._ansiRenderer) return;
    downloadLog(this._ansiRenderer.plainText, `uart-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
  };

  _onSend = async () => {
    if (!this._uart) return;
    const text = this._els.txInput.value;
    if (!text) return;
    try {
      await this._uart.send(new TextEncoder().encode(text + "\r\n"));
      this._els.txInput.value = "";
    } catch (err) {
      this._logger.log(`DAP UART send failed: ${err.message}`);
    }
  };
}
