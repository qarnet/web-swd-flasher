import { Topics } from "../../core/event-bus-topics.js";
import { AnsiRenderer } from "../ansi-renderer.js";
import { downloadLog, autoScrollObserver } from "../log-panel-helpers.js";
import { BasePanel } from "./base-panel.js";

export class SerialTerminalPanel extends BasePanel {
  constructor({ bus, serialManager }) {
    super();
    this._bus = bus;
    this._serialManager = serialManager;
    this._els = null;
    this._ansiRenderer = null;
    this._firstChunk = true;
  }

  mount(rootEl) {
    this._els = {
      termLog: rootEl.querySelector("#serial-term-log"),
      txInput: rootEl.querySelector("#serial-tx-input"),
      btnSend: rootEl.querySelector("#btn-serial-send"),
      btnClear: rootEl.querySelector("#btn-serial-clear"),
      btnDownload: rootEl.querySelector("#btn-serial-download"),
      chkAutoScroll: rootEl.querySelector("#chk-serial-autoscroll"),
    };
    if (!this._els.termLog || !this._els.txInput || !this._els.btnSend) {
      throw new Error("SerialTerminalPanel: missing required DOM nodes under root");
    }

    this._ansiRenderer = new AnsiRenderer();
    this._firstChunk = true;
    autoScrollObserver(this._els.termLog, this._els.chkAutoScroll);

    this._bindBusListener(this._bus, Topics.SERIAL_DATA, ({ bytes }) => {
      const text = new TextDecoder().decode(bytes);
      if (this._firstChunk) { this._firstChunk = false; this._ansiRenderer.write(this._els.termLog, "\n"); }
      this._ansiRenderer.write(this._els.termLog, text);
    });
    this._bindBusListener(this._bus, Topics.SERIAL_CONNECTED, () => { this._firstChunk = true; });

    this._bindDomListener(this._els.btnSend, "click", this._onSend);
    this._bindDomListener(this._els.btnClear, "click", this._onClear);
    this._bindDomListener(this._els.btnDownload, "click", this._onDownload);
  }

  unmount() {
    if (!this._els) return;
    this._teardown();
    this._els = null;
  }

  _onSend = () => {
    const text = this._els.txInput.value;
    if (!text || !this._serialManager.connected) return;
    this._serialManager.send(new TextEncoder().encode(text + "\r\n"))
      .then(() => { this._els.txInput.value = ""; })
      .catch(err => {
        this._bus.emit(Topics.LOG_LINE, { source: "serial", level: "error", message: `Serial send failed: ${err.message}` });
      });
  };

  _onClear = () => { this._els.termLog.textContent = ""; this._ansiRenderer.reset(); this._firstChunk = true; };
  _onDownload = () => { downloadLog(this._ansiRenderer.plainText, `serial-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`); };
}
