import { Topics } from "../../core/event-bus-topics.js";
import { normalizeError } from "../../core/errors.js";
import { persistInput } from "../components/persist-input.js";
import { TerminalSession } from "./terminal-session.js";

export class RttSession extends TerminalSession {
  constructor({ backendProvider }) {
    super();
    this._backendProvider = backendProvider;
    this._rttClient = null;
    this._els = null;
  }

  get channelId() { return "rtt"; }

  isReady() {
    return this._rttClient != null && this._rttClient.downChannelCount > 0;
  }

  async sendRaw(bytes) {
    if (!this._rttClient) throw new Error("RTT not connected");
    await this._rttClient.write(0, bytes);
  }

  init({ rootEl, bus, onData: _onData, onReadyChange }) {
    this._els = {
      ramStartInput: rootEl.querySelector("#rtt-ram-start"),
      ramSizeInput:  rootEl.querySelector("#rtt-ram-size"),
      intervalInput: rootEl.querySelector("#rtt-interval"),
      btnSearch:     rootEl.querySelector("#btn-rtt-search"),
      btnStart:      rootEl.querySelector("#btn-rtt-start"),
      btnStop:       rootEl.querySelector("#btn-rtt-stop"),
      btnDownload:   rootEl.querySelector("#btn-rtt-download"),
      txInput:       rootEl.querySelector("#rtt-tx-input"),
      btnSend:       rootEl.querySelector("#btn-rtt-send"),
      status:        rootEl.querySelector("#rtt-status"),
    };

    persistInput(this._els.ramStartInput, "rtt-ram-start");
    persistInput(this._els.ramSizeInput, "rtt-ram-size");
    persistInput(this._els.intervalInput, "rtt-interval");

    this._onData = _onData;
    this._onReadyChange = onReadyChange;

    this._els.btnSearch.addEventListener("click", this._onSearch);
    this._els.btnStart.addEventListener("click", this._onStart);
    this._els.btnStop.addEventListener("click", this._onStop);

    const unsubConnected    = bus.on(Topics.BACKEND_CONNECTED,    () => { this._els.btnSearch.disabled = false; });
    const unsubDisconnected = bus.on(Topics.BACKEND_DISCONNECTED, () => {
      if (this._rttClient) { this._rttClient.stop(); this._rttClient = null; }
      this._els.btnSearch.disabled = true;
      this._els.btnStart.disabled  = true;
      this._els.btnStop.disabled   = true;
      this._els.btnDownload.disabled = true;
      if (this._els.txInput)  this._els.txInput.disabled  = true;
      if (this._els.btnSend)  this._els.btnSend.disabled  = true;
      if (this._els.status)   this._els.status.textContent = "";
      this._onReadyChange();
    });

    this._els.btnSearch.disabled = !this._backendProvider();

    return () => {
      unsubConnected();
      unsubDisconnected();
      this._els.btnSearch.removeEventListener("click", this._onSearch);
      this._els.btnStart.removeEventListener("click",  this._onStart);
      this._els.btnStop.removeEventListener("click",   this._onStop);
      if (this._rttClient) { this._rttClient.stop(); this._rttClient = null; }
      this._els = null;
    };
  }

  _parseHexInput(s) {
    const t = s.trim();
    return (t.startsWith("0x") || t.startsWith("0X")) ? parseInt(t, 16) : parseInt(t, 10);
  }

  _onSearch = async () => {
    if (this._rttClient) { this._rttClient.stop(); this._rttClient = null; }
    const backend = this._backendProvider();
    if (!backend) return;
    const ramStart  = this._parseHexInput(this._els.ramStartInput.value);
    const ramSizeKb = parseInt(this._els.ramSizeInput.value, 10);
    if (isNaN(ramStart) || isNaN(ramSizeKb) || ramSizeKb <= 0) {
      this._els.status.textContent = "Invalid RAM range"; return;
    }
    this._els.status.textContent = `Searching 0x${ramStart.toString(16)} + ${ramSizeKb}KB...`;
    this._els.btnSearch.disabled = true;
    this._els.btnStart.disabled  = true;

    this._rttClient = backend.createRttSession();
    try {
      const found = await this._rttClient.search(ramStart, ramSizeKb * 1024);
      if (found) {
        this._els.status.textContent =
          `Block at 0x${this._rttClient.controlBlockAddr.toString(16)} — ` +
          `${this._rttClient.upChannelCount} up, ${this._rttClient.downChannelCount} down`;
        this._els.btnStart.disabled = false;
        this._els.btnDownload.disabled = false;
        if (this._rttClient.downChannelCount > 0) {
          if (this._els.txInput)  this._els.txInput.disabled  = false;
          if (this._els.btnSend)  this._els.btnSend.disabled  = false;
        }
        this._onReadyChange();
      } else {
        this._els.status.textContent = "RTT control block not found in RAM range";
        this._rttClient = null;
      }
    } catch (err) {
      this._els.status.textContent = `Search failed: ${normalizeError(err).message}`;
      this._rttClient = null;
    }
    this._els.btnSearch.disabled = !this._backendProvider();
  };

  _onStart = () => {
    if (!this._rttClient) return;
    const intervalMs = parseInt(this._els.intervalInput.value, 10) || 50;
    this._rttClient.removeAllListeners()
      .on("data", ({ data }) => { this._onData?.(data); })
      .on("error", (err) => { if (this._els?.status) this._els.status.textContent = `Poll error: ${err.message}`; });
    this._rttClient.startPolling(intervalMs);
    this._els.status.textContent = `Polling every ${intervalMs}ms...`;
    this._els.btnStart.disabled = true;
    this._els.btnStop.disabled  = false;
    this._onReadyChange();
  };

  _onStop = () => {
    if (!this._rttClient) return;
    this._rttClient.stop();
    this._els.status.textContent = "Stopped";
    this._els.btnStart.disabled = false;
    this._els.btnStop.disabled  = true;
  };
}
