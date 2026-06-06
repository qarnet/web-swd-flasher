function parseHash() {
  const raw = window.location.hash.replace(/^#/, "");
  const [mode, tab] = raw.split("/");
  return { mode: mode || null, tab: tab || null };
}

export class TabController {
  constructor({ containerSelector, buttonSelector, panelSelector, defaultTab }) {
    this._buttons = document.querySelectorAll(buttonSelector);
    this._panels = document.querySelectorAll(panelSelector);
    this._defaultTab = defaultTab;
    this._init();
  }

  _init() {
    this._buttons.forEach(btn => {
      btn.addEventListener("click", () => this.switchTo(btn.dataset.tab, true));
    });
    window.addEventListener("hashchange", () => this._applyHash());
    this._applyHash();
  }

  _applyHash() {
    const { tab } = parseHash();
    this._apply(tab || this._defaultTab);
  }

  switchTo(tabId, updateHash = false) {
    this._apply(tabId);
    if (updateHash) {
      const { mode } = parseHash();
      window.location.hash = `${mode || "swd"}/${tabId}`;
    }
  }

  _apply(tabId) {
    this._buttons.forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabId));
    this._panels.forEach(panel => { panel.hidden = panel.id !== `tab-${tabId}`; });
  }
}

export class ModeController {
  constructor({ sectionMap }) {
    this._buttons = document.querySelectorAll(".mode-btn");
    this._sections = sectionMap;
    this._swdCtrl = document.getElementById("swd-conn-controls");
    this._serialCtrl = document.getElementById("serial-conn-controls");
    this._init();
  }

  _init() {
    this._buttons.forEach(btn => btn.addEventListener("click", () => {
      this._apply(btn.dataset.mode);
      const { tab } = parseHash();
      const mode = btn.dataset.mode;
      window.location.hash = mode === "swd" ? `swd/${tab || "firmware"}` : mode;
    }));
    window.addEventListener("hashchange", () => this._applyHash());
    this._applyHash();
  }

  _applyHash() {
    const { mode } = parseHash();
    this._apply(mode || "swd");
  }

  _apply(mode) {
    this._buttons.forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
    for (const [key, el] of Object.entries(this._sections)) {
      el.hidden = key !== mode;
    }
    if (this._swdCtrl) this._swdCtrl.hidden = mode !== "swd";
    if (this._serialCtrl) this._serialCtrl.hidden = mode !== "serial";
  }
}
