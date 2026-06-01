import { Topics } from "../../core/event-bus-topics.js";
import { normalizeError } from "../../core/errors.js";
import { formatFicrInfo } from "../../nrf/nrf52-ficr.js";
import { TargetInfoView } from "../components/target-info-view.js";
import { CompatBanner } from "../components/compat-banner.js";
import { persistInput } from "../components/persist-input.js";
import { BasePanel } from "./base-panel.js";

export class SwdConnectionPanel extends BasePanel {
  constructor({ bus, backendProvider, backendManager, logger }) {
    super();
    this._bus = bus;
    this._backendProvider = backendProvider;
    this._backendManager = backendManager;
    this._logger = logger;
    this._els = null;
    this._connected = false;
  }

  mount(rootEl) {
    this._els = {
      compatBanner: document.getElementById("compat-banner"),
      compatMsg: document.getElementById("compat-msg"),
      backendSelect: rootEl.querySelector("#backend-select"),
      clockSelect: rootEl.querySelector("#clock-select"),
      btnConnect: rootEl.querySelector("#btn-connect"),
      btnDisconnect: rootEl.querySelector("#btn-disconnect"),
      targetSelect: rootEl.querySelector("#target-select"),
      targetInfoEl: rootEl.querySelector("#target-info"),
      probeCapsEl: rootEl.querySelector("#probe-caps"),
      progressBar: rootEl.querySelector("#progress-bar"),
      progressFill: rootEl.querySelector("#progress-fill"),
    };
    if (!this._els.backendSelect || !this._els.btnConnect || !this._els.btnDisconnect) {
      throw new Error("SwdConnectionPanel: missing required DOM nodes under root");
    }

    this._bindDomListener(this._els.btnConnect, "click", this._onConnect);
    this._bindDomListener(this._els.btnDisconnect, "click", this._onDisconnect);
    this._bindDomListener(this._els.backendSelect, "change", this._onBackendChanged);
    this._bindDomListener(this._els.clockSelect, "change", this._onClockChanged);

    persistInput(this._els.clockSelect, "swd-clock-hz");

    this._bindBusListener(this._bus, Topics.BACKEND_PROGRESS, ({ percent }) => {
      this.setProgress(percent);
    });

    // USB disconnect listener (device yanked)
    this._onUsbDisconnect = (e) => {
      const backend = this._backendProvider();
      if (backend?.transport?.device === e.device && this._connected) {
        this._logger.log("Probe disconnected unexpectedly");
        this._logger.setLed(false);
        this._logger.setTopbarTarget("Not connected");
        this._els.targetInfoEl.textContent = "";
        this._els.targetInfoEl.hidden = true;
        this._els.probeCapsEl.hidden = true;
        this._els.probeCapsEl.textContent = "";
        this._els.btnConnect.disabled = false;
        this._els.btnDisconnect.disabled = true;
        this._els.targetSelect.disabled = true;
        this._connected = false;
        this._bus.emit(Topics.BACKEND_DISCONNECTED);
      }
    };
    navigator.usb?.addEventListener("disconnect", this._onUsbDisconnect);

    this.checkCompatibility();
  }

  unmount() {
    if (!this._els) return;
    this._teardown();
    navigator.usb?.removeEventListener("disconnect", this._onUsbDisconnect);
    this._els = null;
  }

  get connected() {
    return this._connected;
  }

  setProgress(percent) {
    if (percent === null) {
      this._els.progressBar.hidden = true;
      this._els.progressFill.style.width = "0%";
    } else {
      this._els.progressBar.hidden = false;
      this._els.progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    }
  }

  checkCompatibility() {
    const result = CompatBanner.check();
    const ok = CompatBanner.render(this._els.compatBanner, this._els.compatMsg, result);
    if (!ok) {
      this._els.btnConnect.disabled = true;
    }
    return ok;
  }

  _populateTargetSelector(backend) {
    const targets = backend.availableTargets ?? [];
    while (this._els.targetSelect.options.length > 1) this._els.targetSelect.remove(1);
    for (const t of targets) {
      if (t.id === "generic") continue;
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.label;
      this._els.targetSelect.appendChild(opt);
    }
  }

  _onConnect = async () => {
    const name = this._els.backendSelect.value;
    const backend = this._backendManager.setBackend(name);
    try {
      const known = await backend.getAuthorizedDevices();
      if (known.length > 0) {
        this._logger.log(`Found ${known.length} previously authorized USB device(s).`);
      }
      this._logger.setStatus("Selecting probe...");
      await backend.requestDevice();
      await backend.connect();
      const probe = await backend.getProbeInfo();
      const target = await backend.getTargetInfo();
      this._connected = true;
      this._populateTargetSelector(backend);
      if (target.id && target.id !== "generic") {
        this._els.targetSelect.value = target.id;
      }
      const detectNote = target.autoDetected ? "(auto-detected)" : "(manual)";
      this._logger.setStatus(`Connected: ${probe.name} via ${probe.transport}; target ${target.part} ${detectNote}`);
      this._logger.setLed(true);
      this._logger.setTopbarTarget(backend.activeTarget?.label ?? "Connected");
      TargetInfoView.render(this._els.targetInfoEl, probe, target);
      TargetInfoView.renderCaps(this._els.probeCapsEl, probe);
      if (target.ficr) {
        this._logger.log(`FICR: ${formatFicrInfo(target.ficr)}`);
      }
      this._els.btnConnect.disabled = true;
      this._els.btnDisconnect.disabled = false;
      this._els.targetSelect.disabled = false;
      this._bus.emit(Topics.BACKEND_CONNECTED, { backend });
    } catch (error) {
      const normalized = normalizeError(error);
      this._logger.setStatus(`Connect failed (${normalized.code}): ${normalized.message}`);
    }
  };

  _onDisconnect = async () => {
    const backend = this._backendProvider();
    try {
      await backend.disconnect();
    } catch (error) {
      this._logger.log(`Close warning: ${error.message}`);
    }
    this._connected = false;
    this._logger.setStatus("Disconnected");
    this._logger.setLed(false);
    this._logger.setTopbarTarget("Not connected");
    this._els.targetInfoEl.textContent = "";
    this._els.targetInfoEl.hidden = true;
    this._els.probeCapsEl.hidden = true;
    this._els.probeCapsEl.textContent = "";
    this._els.btnConnect.disabled = false;
    this._els.btnDisconnect.disabled = true;
    this._els.targetSelect.disabled = true;
    this._els.targetSelect.value = "auto";
    this._bus.emit(Topics.BACKEND_DISCONNECTED);
  };

  _onBackendChanged = async (event) => {
    const name = event.target.value;
    if (this._connected) await this._onDisconnect();
    this._backendManager.setBackend(name);
    window.localStorage.setItem("backend-name", name);
    this._logger.log(`Backend selected: ${name}`);
    this.checkCompatibility();
  };

  _onClockChanged = () => {
    const hz = parseInt(this._els.clockSelect.value, 10);
    this._backendManager.setSwdClockHz(hz);
    this._logger.log(`SWD clock set to ${hz / 1000} kHz`);
    if (this._connected) this._logger.log("SWD clock change will take effect on next connect.");
  };
}
