import { Topics } from "../../core/event-bus-topics.js";
import { normalizeError } from "../../core/errors.js";
import { BasePanel } from "./base-panel.js";

export class SwdRecoveryPanel extends BasePanel {
  constructor({ bus, backendProvider, logger }) {
    super();
    this._bus = bus;
    this._backendProvider = backendProvider;
    this._logger = logger;
    this._els = null;
  }

  mount(rootEl) {
    this._els = {
      btnCheck: rootEl.querySelector("#btn-check-protection"),
      btnRecover: rootEl.querySelector("#btn-recover"),
      status: rootEl.querySelector("#recovery-status"),
    };
    if (!this._els.btnCheck || !this._els.btnRecover || !this._els.status) {
      throw new Error("SwdRecoveryPanel: missing required DOM nodes under root");
    }

    this._bindDomListener(this._els.btnCheck, "click", this._onCheck);
    this._bindDomListener(this._els.btnRecover, "click", this._onRecover);
    this._bindBusListener(this._bus, Topics.BACKEND_CONNECTED, () => this._setEnabled(true));
    this._bindBusListener(this._bus, Topics.BACKEND_DISCONNECTED, () => {
      this._setEnabled(false);
      this._els.status.textContent = "";
    });

    this._setEnabled(false);
  }

  unmount() {
    if (!this._els) return;
    this._teardown();
    this._els = null;
  }

  _setEnabled(on) {
    this._els.btnCheck.disabled = !on;
    this._els.btnRecover.disabled = !on;
  }

  _onCheck = async () => {
    const backend = this._backendProvider();
    if (!backend) return;
    const recovery = backend.getRecovery();
    if (!recovery) { this._els.status.textContent = "Recovery not supported on this backend"; return; }
    try {
      this._els.status.textContent = "Checking...";
      const result = await recovery.checkProtection();
      const msg = result.locked
        ? `LOCKED (APPROTECTSTATUS=0x${result.apProtectStatus.toString(16)})`
        : `Unlocked (APPROTECTSTATUS=0x${result.apProtectStatus.toString(16)})`;
      this._els.status.textContent = msg;
      this._logger.log(`Protection check: ${msg}`);
    } catch (error) {
      const normalized = normalizeError(error);
      this._els.status.textContent = `Check failed: ${normalized.message}`;
      this._logger.log(`Protection check failed: ${normalized.message}`);
    }
  };

  _onRecover = async () => {
    const confirmed = window.confirm(
      "WARNING: This will erase ALL flash and UICR on the target.\n\nThis cannot be undone. Continue?"
    );
    if (!confirmed) return;
    const backend = this._backendProvider();
    if (!backend) return;
    const recovery = backend.getRecovery();
    if (!recovery) { this._els.status.textContent = "Recovery not supported on this backend"; return; }
    try {
      this._els.status.textContent = "Erasing...";
      this._logger.log("Recovery: starting CTRL-AP mass erase");
      const result = await recovery.eraseAll((prog) => {
        this._els.status.textContent = prog.busy ? "Erase in progress..." : "Erase done, verifying...";
      });
      const msg = result.unlocked ? "Recovery complete — device unlocked" : "Erase done but device still reports locked";
      this._els.status.textContent = msg;
      this._logger.log(`Recovery: ${msg}`);
    } catch (error) {
      const normalized = normalizeError(error);
      this._els.status.textContent = `Recovery failed: ${normalized.message}`;
      this._logger.log(`Recovery failed: ${normalized.message}`);
    }
  };
}
