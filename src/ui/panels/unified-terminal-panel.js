import { TerminalBuffer } from "../terminal-buffer.js";
import { TerminalView } from "../terminal-view.js";
import { TerminalController } from "../components/terminal-controller.js";
import { downloadLog } from "../log-panel-helpers.js";
import { BasePanel } from "./base-panel.js";

export class UnifiedTerminalPanel extends BasePanel {
  /**
   * @param {object} opts
   * @param {import("../terminals/terminal-session.js").TerminalSession} opts.session
   * @param {import("../../core/event-bus.js").EventBus} opts.bus
   * @param {function} opts.backendProvider
   * @param {object} opts.logger
   */
  constructor({ session, bus, backendProvider, logger }) {
    super();
    this._session          = session;
    this._bus              = bus;
    this._backendProvider  = backendProvider;
    this._logger           = logger;
    this._buffer           = null;
    this._view             = null;
    this._controller       = null;
    this._sessionCleanup   = null;
  }

  mount(rootEl) {
    const { channelId, logSelector, txInputSelector, btnSendSelector } = this._session;
    const crKey = `terminal:cr-as-newline:${channelId}`;

    const logEl    = rootEl.querySelector(logSelector);
    const txInput  = rootEl.querySelector(txInputSelector);
    const btnSend  = rootEl.querySelector(btnSendSelector);

    if (!logEl || !txInput || !btnSend) {
      throw new Error(`UnifiedTerminalPanel(${channelId}): missing DOM nodes (log=${logSelector}, tx=${txInputSelector}, send=${btnSendSelector})`);
    }

    const crFlag = localStorage.getItem(crKey) !== "false";

    const chkCr = rootEl.querySelector(`#chk-${channelId}-cr-newline`);
    if (chkCr) chkCr.checked = crFlag;

    this._buffer = new TerminalBuffer({ channelId, crAsNewline: crFlag });

    const chkAutoScroll = rootEl.querySelector(`#chk-${channelId}-autoscroll`);
    this._view = new TerminalView({
      buffer: this._buffer,
      rootEl: logEl,
      autoScroll: chkAutoScroll ? chkAutoScroll.checked : true,
    });

    this._controller = new TerminalController({
      root: rootEl,
      inputEl: txInput,
      sendBtnEl: btnSend,
      buffer: this._buffer,
      view: this._view,
      channelId,
      send: (text) => this._session.send(text),
      isReady: () => this._session.isReady(),
      logger: this._logger,
    });

    // Bind common controls
    const btnClear    = rootEl.querySelector(`#btn-${channelId}-clear`);
    const btnDownload = rootEl.querySelector(`#btn-${channelId}-download`);

    if (btnClear) {
      this._bindDomListener(btnClear, "click", () => { this._buffer.clear(); });
    }
    if (btnDownload) {
      this._bindDomListener(btnDownload, "click", () => {
        downloadLog(this._buffer.toPlainText(), `${channelId}-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
      });
    }
    if (chkAutoScroll) {
      this._bindDomListener(chkAutoScroll, "change", () => {
        this._view.setAutoScroll(chkAutoScroll.checked);
      });
    }
    if (chkCr) {
      this._bindDomListener(chkCr, "change", () => {
        const v = chkCr.checked;
        localStorage.setItem(crKey, String(v));
        this._buffer.setCrAsNewline(v);
      });
    }

    // Init session — passes data + ready callbacks
    this._sessionCleanup = this._session.init({
      rootEl,
      bus: this._bus,
      backendProvider: this._backendProvider,
      onData: (bytes) => this._buffer.append(bytes),
      onReadyChange: () => this._controller?.notifyReadyChange(),
    });
  }

  unmount() {
    if (!this._buffer) return;
    this._sessionCleanup?.();
    this._sessionCleanup = null;
    this._teardown();
    if (this._controller) { this._controller.destroy(); this._controller = null; }
    if (this._view) { this._view.destroy(); this._view = null; }
    this._buffer = null;
  }
}
