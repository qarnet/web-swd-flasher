import { Topics } from "../../core/event-bus-topics.js";
import { TerminalBuffer } from "../terminal-buffer.js";
import { TerminalView } from "../terminal-view.js";
import { downloadLog } from "../log-panel-helpers.js";
import { TerminalController } from "../components/terminal-controller.js";
import { BasePanel } from "./base-panel.js";

const CR_KEY = "terminal:cr-as-newline:serial";

export class SerialTerminalPanel extends BasePanel {
  constructor({ bus, serialManager }) {
    super();
    this._bus = bus;
    this._serialManager = serialManager;
    this._els = null;
    this._buffer = null;
    this._view = null;
    this._controller = null;
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
      chkCrNewline: rootEl.querySelector("#chk-serial-cr-newline"),
    };
    if (!this._els.termLog || !this._els.txInput || !this._els.btnSend) {
      throw new Error("SerialTerminalPanel: missing required DOM nodes under root");
    }

    const crFlag = localStorage.getItem(CR_KEY) !== "false";
    this._els.chkCrNewline.checked = crFlag;
    this._buffer = new TerminalBuffer({ channelId: "serial", crAsNewline: crFlag });
    this._view = new TerminalView({
      buffer: this._buffer,
      rootEl: this._els.termLog,
      autoScroll: this._els.chkAutoScroll.checked,
    });
    this._firstChunk = true;

    this._controller = new TerminalController({
      root: rootEl,
      inputEl: this._els.txInput,
      sendBtnEl: this._els.btnSend,
      buffer: this._buffer,
      view: this._view,
      channelId: "serial",
      send: async (text) => {
        await this._serialManager.send(new TextEncoder().encode(text + "\r\n"));
      },
      isReady: () => this._serialManager.connected,
      logger: { log: (msg) => this._bus.emit(Topics.LOG_LINE, { source: "serial", level: "error", message: msg }) },
    });

    this._bindBusListener(this._bus, Topics.SERIAL_DATA, ({ bytes }) => {
      if (this._firstChunk) { this._firstChunk = false; this._buffer.appendString("\n"); }
      this._buffer.append(bytes);
    });
    this._bindBusListener(this._bus, Topics.SERIAL_CONNECTED, () => { this._firstChunk = true; });

    this._bindDomListener(this._els.btnClear, "click", this._onClear);
    this._bindDomListener(this._els.btnDownload, "click", this._onDownload);
    this._bindDomListener(this._els.chkAutoScroll, "change", () => {
      this._view.setAutoScroll(this._els.chkAutoScroll.checked);
    });
    this._bindDomListener(this._els.chkCrNewline, "change", () => {
      const v = this._els.chkCrNewline.checked;
      localStorage.setItem(CR_KEY, String(v));
      this._buffer.setCrAsNewline(v);
    });
  }

  unmount() {
    if (!this._els) return;
    this._teardown();
    if (this._controller) { this._controller.destroy(); this._controller = null; }
    if (this._view) { this._view.destroy(); this._view = null; }
    this._buffer = null;
    this._els = null;
  }

  _onClear = () => { this._buffer.clear(); this._firstChunk = true; };
  _onDownload = () => { downloadLog(this._buffer.toPlainText(), `serial-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`); };
}
