import { Topics } from "../../core/event-bus-topics.js";
import { normalizeError } from "../../core/errors.js";
import { UICR_REGS } from "../../nrf/nrf52-uicr-map.js";
import { BasePanel } from "./base-panel.js";

export class SwdUicrPanel extends BasePanel {
  constructor({ bus, backendProvider, logger }) {
    super();
    this._bus = bus;
    this._backendProvider = backendProvider;
    this._logger = logger;
    this._els = null;
  }

  mount(rootEl) {
    this._els = {
      btnRead: rootEl.querySelector("#btn-uicr-read"),
      status: rootEl.querySelector("#uicr-status"),
      dump: rootEl.querySelector("#uicr-dump"),
    };
    if (!this._els.btnRead || !this._els.status || !this._els.dump) {
      throw new Error("SwdUicrPanel: missing required DOM nodes under root");
    }

    this._bindDomListener(this._els.btnRead, "click", this._onRead);
    this._bindBusListener(this._bus, Topics.BACKEND_CONNECTED, () => this._setEnabled(true));
    this._bindBusListener(this._bus, Topics.BACKEND_DISCONNECTED, () => {
      this._setEnabled(false);
      this._els.status.textContent = "";
      this._els.dump.textContent = "";
      this._els.dump.hidden = true;
    });

    this._setEnabled(false);
  }

  unmount() {
    if (!this._els) return;
    this._teardown();
    this._els = null;
  }

  _setEnabled(on) {
    this._els.btnRead.disabled = !on;
  }

  _onRead = async () => {
    const backend = this._backendProvider();
    if (!backend) return;
    this._els.status.textContent = "Reading UICR...";
    this._els.dump.textContent = "";
    try {
      const mem = backend.getMemoryAccess();
      const lines = [];
      for (const { name, addr } of UICR_REGS) {
        const val = await mem.readMem32(addr);
        lines.push(`${name.padEnd(14)}: 0x${val.toString(16).padStart(8, "0")} (${addr.toString(16).toUpperCase()})`);
      }
      this._els.dump.textContent = lines.join("\n");
      this._els.dump.hidden = false;
      this._els.status.textContent = "UICR read complete";
      this._logger.log("UICR read complete");
    } catch (e) {
      this._els.status.textContent = `UICR read failed: ${normalizeError(e).message}`;
    }
  };
}
