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

  buildControls() {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="dd-row" style="margin-bottom:0.4rem">
        <label class="dd-check-label" style="gap:0.3rem">
          RAM start <input class="rtt-ram-start dd-input" type="text" value="0x20000000" style="width:6.5rem" />
        </label>
        <label class="dd-check-label" style="gap:0.3rem">
          Size KB <input class="rtt-ram-size dd-input" type="text" value="256" style="width:3rem" />
        </label>
        <label class="dd-check-label" style="gap:0.3rem">
          Poll ms <input class="rtt-interval dd-input" type="number" value="50" min="10" max="500" style="width:3rem" />
        </label>
      </div>
      <div class="dd-row">
        <div class="dd-actions">
          <button class="btn-rtt-search" type="button" disabled>Search</button>
          <button class="btn-rtt-start" type="button" disabled>Start Polling</button>
          <button class="btn-rtt-stop" type="button" disabled>Stop</button>
        </div>
      </div>
      <p class="rtt-status" style="margin:0.3rem 0 0;font-size:0.72rem;color:var(--muted)"></p>
    `;

    this._els = {
      ramStartInput: container.querySelector(".rtt-ram-start"),
      ramSizeInput:  container.querySelector(".rtt-ram-size"),
      intervalInput: container.querySelector(".rtt-interval"),
      btnSearch:     container.querySelector(".btn-rtt-search"),
      btnStart:      container.querySelector(".btn-rtt-start"),
      btnStop:       container.querySelector(".btn-rtt-stop"),
      status:        container.querySelector(".rtt-status"),
    };

    persistInput(this._els.ramStartInput, "rtt-ram-start");
    persistInput(this._els.ramSizeInput, "rtt-ram-size");
    persistInput(this._els.intervalInput, "rtt-interval");

    return container;
  }

  init({ rootEl: _rootEl, bus, onData: _onData, onReadyChange }) {
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
      if (this._els.status) this._els.status.textContent = "";
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
        if (this._rttClient.downChannelCount > 0) {
          // xterm handles input directly
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
