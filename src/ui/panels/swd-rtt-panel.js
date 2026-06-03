import { Topics } from "../../core/event-bus-topics.js";
import { normalizeError } from "../../core/errors.js";
import { TerminalBuffer } from "../terminal-buffer.js";
import { TerminalView } from "../terminal-view.js";
import { downloadLog } from "../log-panel-helpers.js";
import { persistInput } from "../components/persist-input.js";
import { BasePanel } from "./base-panel.js";

const CR_KEY = "terminal:cr-as-newline:rtt";

export class SwdRttPanel extends BasePanel {
  constructor({ bus, backendProvider, logger }) {
    super();
    this._bus = bus;
    this._backendProvider = backendProvider;
    this._logger = logger;
    this._els = null;
    this._rttClient = null;
    this._buffer = null;
    this._view = null;
  }

  mount(rootEl) {
    this._els = {
      ramStartInput: rootEl.querySelector("#rtt-ram-start"),
      ramSizeInput: rootEl.querySelector("#rtt-ram-size"),
      intervalInput: rootEl.querySelector("#rtt-interval"),
      btnSearch: rootEl.querySelector("#btn-rtt-search"),
      btnStart: rootEl.querySelector("#btn-rtt-start"),
      btnStop: rootEl.querySelector("#btn-rtt-stop"),
      btnClear: rootEl.querySelector("#btn-rtt-clear"),
      btnDownload: rootEl.querySelector("#btn-rtt-download"),
      chkAutoScroll: rootEl.querySelector("#chk-rtt-autoscroll"),
      chkCrNewline: rootEl.querySelector("#chk-rtt-cr-newline"),
      status: rootEl.querySelector("#rtt-status"),
      log: rootEl.querySelector("#rtt-log"),
      txInput: rootEl.querySelector("#rtt-tx-input"),
      btnSend: rootEl.querySelector("#btn-rtt-send"),
    };
    if (!this._els.btnSearch || !this._els.status || !this._els.log) {
      throw new Error("SwdRttPanel: missing required DOM nodes under root");
    }

    const crFlag = localStorage.getItem(CR_KEY) !== "false";
    this._els.chkCrNewline.checked = crFlag;
    this._buffer = new TerminalBuffer({ channelId: "rtt", crAsNewline: crFlag });
    this._view = new TerminalView({
      buffer: this._buffer,
      rootEl: this._els.log,
      autoScroll: this._els.chkAutoScroll.checked,
    });
    persistInput(this._els.ramStartInput, "rtt-ram-start");
    persistInput(this._els.ramSizeInput, "rtt-ram-size");
    persistInput(this._els.intervalInput, "rtt-interval");

    this._bindDomListener(this._els.btnSearch, "click", this._onSearch);
    this._bindDomListener(this._els.btnStart, "click", this._onStart);
    this._bindDomListener(this._els.btnStop, "click", this._onStop);
    this._bindDomListener(this._els.btnClear, "click", this._onClear);
    this._bindDomListener(this._els.btnDownload, "click", this._onDownload);
    this._bindDomListener(this._els.btnSend, "click", this._onSend);
    this._bindDomListener(this._els.chkAutoScroll, "change", () => {
      this._view.setAutoScroll(this._els.chkAutoScroll.checked);
    });
    this._bindDomListener(this._els.chkCrNewline, "change", () => {
      const v = this._els.chkCrNewline.checked;
      localStorage.setItem(CR_KEY, String(v));
      this._buffer.setCrAsNewline(v);
    });

    this._bindBusListener(this._bus, Topics.BACKEND_CONNECTED, () => this._setEnabled(true));
    this._bindBusListener(this._bus, Topics.BACKEND_DISCONNECTED, () => {
      if (this._rttClient) { this._rttClient.stop(); this._rttClient = null; }
      this._els.btnSearch.disabled = true;
      this._els.btnStart.disabled = true;
      this._els.btnStop.disabled = true;
      this._els.btnDownload.disabled = true;
      this._els.txInput.disabled = true;
      this._els.btnSend.disabled = true;
      this._els.status.textContent = "";
      this._buffer.clear();
    });

    this._setEnabled(false);
  }

  unmount() {
    if (!this._els) return;
    this._teardown();
    if (this._view) { this._view.destroy(); this._view = null; }
    this._buffer = null;
    this._els = null;
  }

  _setEnabled(on) {
    if (!on) return;
    this._els.btnSearch.disabled = false;
  }

  _parseHexInput(s) {
    const t = s.trim();
    if (t.startsWith("0x") || t.startsWith("0X")) return parseInt(t, 16);
    return parseInt(t, 10);
  }

  _onSearch = async () => {
    if (this._rttClient) { this._rttClient.stop(); this._rttClient = null; }
    const backend = this._backendProvider();
    if (!backend) return;
    const ramStart = this._parseHexInput(this._els.ramStartInput.value);
    const ramSizeKb = parseInt(this._els.ramSizeInput.value, 10);
    if (isNaN(ramStart) || isNaN(ramSizeKb) || ramSizeKb <= 0) {
      this._els.status.textContent = "Invalid RAM range"; return;
    }
    const ramSize = ramSizeKb * 1024;
    this._els.status.textContent = `Searching 0x${ramStart.toString(16)} + ${ramSizeKb}KB...`;
    this._els.btnSearch.disabled = true;
    this._els.btnStart.disabled = true;

    this._rttClient = backend.createRttSession();
    this._buffer.clear();
    try {
      const found = await this._rttClient.search(ramStart, ramSize);
      if (found) {
        this._els.status.textContent = `Control block at 0x${this._rttClient.controlBlockAddr.toString(16)} \u2014 ${this._rttClient.upChannelCount} up, ${this._rttClient.downChannelCount} down channel(s)`;
        this._els.btnStart.disabled = false;
        if (this._rttClient.downChannelCount > 0) {
          this._els.txInput.disabled = false;
          this._els.btnSend.disabled = false;
        }
      } else {
        this._els.status.textContent = "RTT control block not found in RAM range";
        this._rttClient = null;
      }
    } catch (error) {
      this._els.status.textContent = `Search failed: ${normalizeError(error).message}`;
      this._rttClient = null;
    }
    this._els.btnSearch.disabled = !backend;
  };

  _onStart = () => {
    if (!this._rttClient) return;
    const intervalMs = parseInt(this._els.intervalInput.value, 10) || 50;
    this._buffer.clear();
    this._rttClient.removeAllListeners()
      .on("data", ({ channel, data }) => {
        this._buffer.append(data);
      })
      .on("error", (err) => { this._els.status.textContent = `Poll error: ${err.message}`; });
    this._rttClient.startPolling(intervalMs);
    this._els.status.textContent = `Polling channel(s) every ${intervalMs}ms...`;
    this._els.btnStart.disabled = true;
    this._els.btnStop.disabled = false;
    this._els.btnDownload.disabled = false;
  };

  _onStop = () => {
    if (!this._rttClient) return;
    this._rttClient.stop();
    this._els.status.textContent = "Stopped";
    this._els.btnStart.disabled = false;
    this._els.btnStop.disabled = true;
  };

  _onClear = () => { this._buffer.clear(); };
  _onDownload = () => { downloadLog(this._buffer.toPlainText(), `rtt-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`); };

  _onSend = async () => {
    if (!this._rttClient) return;
    const text = this._els.txInput.value;
    if (!text) return;
    try {
      await this._rttClient.write(0, new TextEncoder().encode(text + "\n"));
      this._els.txInput.value = "";
    } catch (error) {
      this._els.status.textContent = `Send failed: ${normalizeError(error).message}`;
    }
  };
}
