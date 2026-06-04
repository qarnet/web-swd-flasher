export class TabController {
  constructor({ containerSelector, buttonSelector, panelSelector, defaultTab }) {
    this._buttons = document.querySelectorAll(buttonSelector);
    this._panels = document.querySelectorAll(panelSelector);
    this._defaultTab = defaultTab;
    this._init();
  }

  _init() {
    this._buttons.forEach(btn => {
      btn.addEventListener("click", () => this.switchTo(btn.dataset.tab));
    });
    this.switchTo(this._defaultTab);
  }

  switchTo(tabId) {
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
      this._buttons.forEach(b => b.classList.toggle("active", b === btn));
      const mode = btn.dataset.mode;
      for (const [key, el] of Object.entries(this._sections)) {
        el.hidden = key !== mode;
      }
      if (this._swdCtrl) this._swdCtrl.hidden = mode !== "swd";
      if (this._serialCtrl) this._serialCtrl.hidden = mode !== "serial";
    }));
  }
}
