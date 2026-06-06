import { Topics } from "../../core/event-bus-topics.js";
import { BasePanel } from "./base-panel.js";

export class SerialConnectionPanel extends BasePanel {
  constructor({ bus, serialManager }) {
    super();
    this._bus = bus;
    this._serialManager = serialManager;
    this._els = null;
  }

  mount(rootEl) {
    this._els = {
      compatBanner: document.getElementById("serial-compat-banner"),
      compatMsg: document.getElementById("serial-compat-msg"),
      baudSelect: rootEl.querySelector("#serial-baud-select"),
      btnConnect: rootEl.querySelector("#btn-serial-connect"),
      btnDisconnect: rootEl.querySelector("#btn-serial-disconnect"),
      status: rootEl.querySelector("#serial-status"),
    };
    if (!this._els.baudSelect || !this._els.btnConnect || !this._els.btnDisconnect) {
      throw new Error("SerialConnectionPanel: missing required DOM nodes under root");
    }

    const savedBaud = localStorage.getItem("serial-baud");
    if (savedBaud !== null) this._els.baudSelect.value = savedBaud;
    this._els.baudSelect.addEventListener("change", () => {
      localStorage.setItem("serial-baud", this._els.baudSelect.value);
    });

    this._bindDomListener(this._els.btnConnect, "click", this._onConnect);
    this._bindDomListener(this._els.btnDisconnect, "click", this._onDisconnect);

    this.checkCompatibility();
  }

  unmount() {
    if (!this._els) return;
    this._teardown();
    this._els = null;
  }

  checkCompatibility() {
    if (!this._serialManager.constructor.supported) {
      this._els.compatBanner.hidden = false;
      this._els.compatMsg.textContent = "Web Serial API not available in this browser. Use Chrome 89+ or Edge 89+.";
      this._els.btnConnect.disabled = true;
      return false;
    }
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      this._els.compatBanner.hidden = false;
      this._els.compatMsg.textContent = "Web Serial requires HTTPS. Serve over HTTPS or localhost.";
      this._els.btnConnect.disabled = true;
      return false;
    }
    return true;
  }

  _onConnect = async () => {
    try {
      let info;
      const authorized = await this._serialManager.getAuthorizedPorts();
      if (authorized.length === 1) {
        info = await this._serialManager.useAuthorizedPort();
        this._els.status.textContent = `Auto-connecting to VID 0x${(info.usbVendorId ?? 0).toString(16)}...`;
      } else {
        info = await this._serialManager.requestPort();
        this._els.status.textContent = `Selected: VID 0x${(info.usbVendorId ?? 0).toString(16)} PID 0x${(info.usbProductId ?? 0).toString(16)}`;
      }
      const baudRate = parseInt(this._els.baudSelect.value, 10) || 115200;
      await this._serialManager.connect({ baudRate });
      this._els.status.textContent = `Connected at ${baudRate} baud`;
      this._els.btnConnect.disabled = true;
      this._els.btnDisconnect.disabled = false;
      this._els.baudSelect.disabled = true;
      this._bus.emit(Topics.SERIAL_CONNECTED, { baudRate, portInfo: info });
      this._bus.emit(Topics.LOG_LINE, { source: "serial", level: "info", message: `Serial connected at ${baudRate} baud` });
    } catch (err) {
      if (err.name === "NotFoundError" || err.message?.includes("cancel")) {
        this._els.status.textContent = "No port selected";
      } else {
        this._els.status.textContent = `Connection failed: ${err.message}`;
        this._bus.emit(Topics.LOG_LINE, { source: "serial", level: "error", message: `Serial connection failed: ${err.message}` });
      }
    }
  };

  _onDisconnect = async () => {
    try { await this._serialManager.disconnect(); } catch { /* ignore */ }
    this._onSerialDisconnect();
    this._bus.emit(Topics.LOG_LINE, { source: "serial", level: "info", message: "Serial disconnected" });
  };

  _onSerialDisconnect() {
    this._els.status.textContent = "Disconnected";
    this._els.btnConnect.disabled = false;
    this._els.btnDisconnect.disabled = true;
    this._els.baudSelect.disabled = false;
    this._bus.emit(Topics.SERIAL_DISCONNECTED, { unexpected: false });
  }

  onUnexpectedDisconnect() {
    this._els.status.textContent = "Port disconnected";
    this._els.btnConnect.disabled = false;
    this._els.btnDisconnect.disabled = true;
    this._els.baudSelect.disabled = false;
    this._bus.emit(Topics.SERIAL_DISCONNECTED, { unexpected: true });
    this._bus.emit(Topics.LOG_LINE, { source: "serial", level: "error", message: "Serial port disconnected unexpectedly" });
  }
}
