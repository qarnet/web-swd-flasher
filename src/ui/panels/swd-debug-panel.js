import { Topics } from "../../core/event-bus-topics.js";
import { normalizeError } from "../../core/errors.js";
import { BasePanel } from "./base-panel.js";

export class SwdDebugPanel extends BasePanel {
  constructor({ bus, backendProvider, logger }) {
    super();
    this._bus = bus;
    this._backendProvider = backendProvider;
    this._logger = logger;
    this._els = null;
  }

  mount(rootEl) {
    this._els = {
      btnHalt: rootEl.querySelector("#btn-core-halt"),
      btnResume: rootEl.querySelector("#btn-core-resume"),
      btnStep: rootEl.querySelector("#btn-core-step"),
      btnRegs: rootEl.querySelector("#btn-core-regs"),
      status: rootEl.querySelector("#debug-status"),
      regs: rootEl.querySelector("#debug-regs"),
    };
    if (!this._els.btnHalt || !this._els.btnResume || !this._els.btnStep || !this._els.btnRegs || !this._els.status || !this._els.regs) {
      throw new Error("SwdDebugPanel: missing required DOM nodes under root");
    }

    this._bindDomListener(this._els.btnHalt, "click", this._onHalt);
    this._bindDomListener(this._els.btnResume, "click", this._onResume);
    this._bindDomListener(this._els.btnStep, "click", this._onStep);
    this._bindDomListener(this._els.btnRegs, "click", this._onRegs);
    this._bindBusListener(this._bus, Topics.BACKEND_CONNECTED, () => this._setEnabled(true));
    this._bindBusListener(this._bus, Topics.BACKEND_DISCONNECTED, () => {
      this._setEnabled(false);
      this._els.status.textContent = "";
      this._els.regs.textContent = "";
      this._els.regs.hidden = true;
    });

    this._setEnabled(false);
  }

  unmount() {
    if (!this._els) return;
    this._teardown();
    this._els = null;
  }

  _setEnabled(on) {
    this._els.btnHalt.disabled = !on;
    this._els.btnResume.disabled = !on;
    this._els.btnStep.disabled = !on;
    this._els.btnRegs.disabled = !on;
  }

  _onHalt = async () => {
    const backend = this._backendProvider();
    if (!backend) return;
    const cortex = backend.getCortex();
    if (!cortex) { this._els.status.textContent = "Debug not supported on this backend"; return; }
    this._els.status.textContent = "Halting...";
    try { await cortex.halt(); this._els.status.textContent = "Halted"; this._logger.log("Core halted"); }
    catch (e) { this._els.status.textContent = `Halt failed: ${normalizeError(e).message}`; }
  };

  _onResume = async () => {
    const backend = this._backendProvider();
    if (!backend) return;
    const cortex = backend.getCortex();
    if (!cortex) { this._els.status.textContent = "Debug not supported on this backend"; return; }
    this._els.status.textContent = "Resuming...";
    try { await cortex.resume(); this._els.status.textContent = "Running"; this._logger.log("Core resumed"); }
    catch (e) { this._els.status.textContent = `Resume failed: ${normalizeError(e).message}`; }
  };

  _onStep = async () => {
    const backend = this._backendProvider();
    if (!backend) return;
    const cortex = backend.getCortex();
    if (!cortex) { this._els.status.textContent = "Debug not supported on this backend"; return; }
    this._els.status.textContent = "Stepping...";
    try { await cortex.step(); this._els.status.textContent = "Stepped (halted)"; this._logger.log("Core stepped"); }
    catch (e) { this._els.status.textContent = `Step failed: ${normalizeError(e).message}`; }
  };

  _onRegs = async () => {
    const backend = this._backendProvider();
    if (!backend) return;
    const cortex = backend.getCortex();
    if (!cortex) { this._els.status.textContent = "Debug not supported on this backend"; return; }
    this._els.status.textContent = "Reading registers...";
    this._els.regs.textContent = "";
    try {
      const regs = await cortex.readCoreRegs();
      const lines = Object.entries(regs).map(([name, val]) =>
        `${name.padEnd(5)}: 0x${val.toString(16).padStart(8, "0")}`
      );
      this._els.regs.textContent = lines.join("\n");
      this._els.regs.hidden = false;
      this._els.status.textContent = "Registers read";
    } catch (e) {
      this._els.status.textContent = `Register read failed: ${normalizeError(e).message}`;
    }
  };
}
