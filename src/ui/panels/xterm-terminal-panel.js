import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { RawInputMode } from "../terminals/input-mode.js";
import { TerminalSidebarController } from "../components/terminal-sidebar-controller.js";
import { downloadLog } from "../log-panel-helpers.js";
import { BasePanel } from "./base-panel.js";

const _encoder = new TextEncoder();

export class XtermTerminalPanel extends BasePanel {
  constructor({ session, bus, backendProvider, logger }) {
    super();
    this._session = session;
    this._bus = bus;
    this._backendProvider = backendProvider;
    this._logger = logger;
    this._term = null;
    this._fitAddon = null;
    this._searchAddon = null;
    this._sessionCleanup = null;
    this._sidebar = null;
    this._logLines = [];
    this._resizeObserver = null;
    this._containerEl = null;
  }

  mount(containerEl, sessionControlsEl = containerEl) {
    this._containerEl = containerEl;

    containerEl.innerHTML = `
      <div class="terminal-panel-grid">
        <aside class="terminal-templates-slot"></aside>
        <div class="terminal-xterm-col">
          <div class="xterm-mount-point"></div>
          <div class="terminal-toolbar"></div>
        </div>
        <aside class="terminal-queue-slot"></aside>
      </div>
    `;

    const channelId = this._session.channelId;
    const savedFontSize = parseInt(localStorage.getItem(`terminal:fontsize:${channelId}`), 10) || 14;

    this._term = new Terminal({
      cursorBlink: true,
      convertEol: false,
      scrollback: 10_000,
      fontFamily: 'ui-monospace, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: savedFontSize,
      lineHeight: 1.2,
      theme: {
        background: "#050807",
        foreground: "#d7f7d7",
        cursor: "#d7f7d7",
        selectionBackground: "#355c7d44",
        selectionForeground: "#050807",
      },
    });

    this._fitAddon = new FitAddon();
    this._searchAddon = new SearchAddon();
    this._term.loadAddon(this._fitAddon);
    this._term.loadAddon(this._searchAddon);
    this._term.loadAddon(new WebLinksAddon());

    const mountPoint = containerEl.querySelector(".xterm-mount-point");
    this._term.open(mountPoint);
    this._fitAddon.fit();

    const inputMode = new RawInputMode(this._session);
    this._term.onData(data => inputMode.handle(data));

    const decoder = new TextDecoder("utf-8", { fatal: false });
    this._sessionCleanup = this._session.init({
      rootEl: sessionControlsEl,
      bus: this._bus,
      backendProvider: this._backendProvider,
      onData: (bytes) => {
        const text = decoder.decode(bytes, { stream: true });
        this._term.write(text);
        this._logLines.push(text);
      },
      onReadyChange: () => {
        if (this._session.isReady()) {
          this._term.writeln("\r\n\x1b[32m[connected]\x1b[0m");
          this._term.focus();
        } else {
          this._term.writeln("\r\n\x1b[33m[disconnected]\x1b[0m");
        }
      },
    });

    this._resizeObserver = new ResizeObserver(() => {
      try { this._fitAddon.fit(); } catch {}
    });
    this._resizeObserver.observe(containerEl);

    this._buildToolbar(containerEl, channelId, savedFontSize);

    const grid = containerEl.querySelector(".terminal-panel-grid");
    const templatesSlot = grid.querySelector(".terminal-templates-slot");
    const queueSlot = grid.querySelector(".terminal-queue-slot");

    this._sidebar = new TerminalSidebarController({
      rootEl: templatesSlot,
      channelId,
      send: (text) => this._session.sendRaw(_encoder.encode(text + "\r")),
      isReady: () => this._session.isReady(),
      logger: this._logger,
    });

    const origMount = this._sidebar.mount.bind(this._sidebar);
    this._sidebar.mount = () => {
      origMount();
      const templatesAside = templatesSlot.querySelector(".terminal-templates");
      const queueAside = templatesSlot.querySelector(".terminal-queue");
      if (templatesAside) {
        templatesSlot.removeChild(templatesAside);
        templatesSlot.appendChild(templatesAside);
      }
      if (queueAside) {
        templatesSlot.removeChild(queueAside);
        queueSlot.appendChild(queueAside);
      }
    };
    this._sidebar.mount();
  }

  _buildToolbar(containerEl, channelId, savedFontSize) {
    const bar = containerEl.querySelector(".terminal-toolbar");

    // ---- Search dropdown ----
    const searchPanel = document.createElement("div");
    searchPanel.className = "terminal-dropdown xterm-toolbar-dropdown";
    searchPanel.style.display = "none";

    const searchClose = document.createElement("button");
    searchClose.className = "dd-close";
    searchClose.textContent = "✕";
    searchPanel.appendChild(searchClose);

    const searchRow = document.createElement("div");
    searchRow.className = "dd-row";
    searchRow.innerHTML = `
      <input class="search-query" type="text" placeholder="Find…" />
      <button class="btn-find-prev" title="Previous">↑</button>
      <button class="btn-find-next" title="Next">↓</button>
      <label class="dd-check-label"><input type="checkbox" class="chk-find-regex" /> Regex</label>
      <label class="dd-check-label"><input type="checkbox" class="chk-find-case" /> Case</label>
      <span class="search-count"></span>
    `;
    searchPanel.appendChild(searchRow);
    bar.appendChild(searchPanel);

    const searchInput = searchRow.querySelector(".search-query");
    const searchCount = searchRow.querySelector(".search-count");

    const runSearch = (dir = "next") => {
      const q = searchInput.value.trim();
      if (!q) return;
      const opts = {
        regex: searchRow.querySelector(".chk-find-regex").checked,
        caseSensitive: searchRow.querySelector(".chk-find-case").checked,
        decorations: {
          matchBackground: "#ffff0044",
          matchBorder: "#ffff0099",
          matchOverviewRuler: "#ffff00",
          activeMatchBackground: "#ffaa0088",
          activeMatchBorder: "#ffaa00",
          activeMatchColorOverviewRuler: "#ffaa00",
        },
      };
      const found = dir === "next"
        ? this._searchAddon.findNext(q, opts)
        : this._searchAddon.findPrevious(q, opts);
      searchCount.textContent = found ? "" : "not found";
    };

    this._bindDomListener(searchRow.querySelector(".btn-find-next"), "click", () => runSearch("next"));
    this._bindDomListener(searchRow.querySelector(".btn-find-prev"), "click", () => runSearch("prev"));
    this._bindDomListener(searchInput, "keydown", (e) => {
      if (e.key === "Enter") runSearch(e.shiftKey ? "prev" : "next");
      if (e.key === "Escape") closeAll();
    });

    // ---- Settings dropdown ----
    const settingsPanel = document.createElement("div");
    settingsPanel.className = "terminal-dropdown xterm-toolbar-dropdown";
    settingsPanel.style.display = "none";

    const settingsClose = document.createElement("button");
    settingsClose.className = "dd-close";
    settingsClose.textContent = "✕";
    settingsPanel.appendChild(settingsClose);

    const ddRow = document.createElement("div");
    ddRow.className = "dd-row";
    ddRow.innerHTML = `
      <div class="dd-actions">
        <button class="dd-clear">Clear</button>
        <button class="dd-copy">Copy All</button>
        <button class="dd-download">Download Log</button>
      </div>
      <div class="dd-fontsize">
        <button class="btn-font-decrease" title="Decrease font size">A-</button>
        <span class="xterm-fontsize-label">${savedFontSize}px</span>
        <button class="btn-font-increase" title="Increase font size">A+</button>
      </div>
    `;
    settingsPanel.appendChild(ddRow);
    bar.appendChild(settingsPanel);

    const fontSizeLabel = ddRow.querySelector(".xterm-fontsize-label");
    const updateFontSize = (delta) => {
      const current = this._term.options.fontSize || 14;
      const next = Math.max(8, Math.min(32, current + delta));
      this._term.options.fontSize = next;
      try { this._fitAddon.fit(); } catch {}
      localStorage.setItem(`terminal:fontsize:${channelId}`, String(next));
      if (fontSizeLabel) fontSizeLabel.textContent = `${next}px`;
    };

    this._bindDomListener(ddRow.querySelector(".dd-clear"), "click", () => {
      this._term.clear();
      this._logLines = [];
    });
    this._bindDomListener(ddRow.querySelector(".dd-copy"), "click", () => {
      const btn = ddRow.querySelector(".dd-copy");
      navigator.clipboard.writeText(this._logLines.join("")).then(() => {
        const orig = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = orig; }, 1500);
      });
    });
    this._bindDomListener(ddRow.querySelector(".dd-download"), "click", () => {
      downloadLog(
        this._logLines.join(""),
        `${channelId}-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`
      );
    });
    this._bindDomListener(ddRow.querySelector(".btn-font-decrease"), "click", () => updateFontSize(-1));
    this._bindDomListener(ddRow.querySelector(".btn-font-increase"), "click", () => updateFontSize(1));

    // ---- Toolbar buttons ----
    const allDropPanels = [searchPanel, settingsPanel];

    const closeAllExcept = (keep) => {
      allDropPanels.forEach(p => {
        if (p !== keep) {
          p.style.display = "none";
          p._toolbarBtn?.classList.remove("active");
        }
      });
    };

    const closeAll = () => closeAllExcept(null);

    this._bindDomListener(searchClose, "click", (e) => { e.stopPropagation(); closeAll(); });
    this._bindDomListener(settingsClose, "click", (e) => { e.stopPropagation(); closeAll(); });

    const makeDropBtn = (label, title, panelEl) => {
      const btn = document.createElement("button");
      btn.className = "toolbar-btn";
      btn.textContent = label;
      btn.title = title;
      panelEl._toolbarBtn = btn;
      this._bindDomListener(btn, "click", (e) => {
        e.stopPropagation();
        const isOpen = panelEl.style.display === "block";
        closeAllExcept(isOpen ? null : panelEl);
        panelEl.style.display = isOpen ? "none" : "block";
        btn.classList.toggle("active", !isOpen);
        if (!isOpen && panelEl === searchPanel) searchInput.focus();
      });
      return btn;
    };

    bar.appendChild(makeDropBtn("🔍", "Search", searchPanel));
    bar.appendChild(makeDropBtn("⚙", "Settings", settingsPanel));

    const fullscreenBtn = document.createElement("button");
    fullscreenBtn.className = "toolbar-btn";
    fullscreenBtn.textContent = "⛶";
    fullscreenBtn.title = "Fullscreen";
    this._bindDomListener(fullscreenBtn, "click", (e) => {
      e.stopPropagation();
      const grid = containerEl.querySelector(".terminal-panel-grid");
      if (grid) {
        grid.classList.toggle("terminal-fullscreen");
        setTimeout(() => { try { this._fitAddon.fit(); } catch {} }, 100);
      }
    });
    bar.appendChild(fullscreenBtn);

    bar.addEventListener("mousedown", (e) => e.stopPropagation());
    document.addEventListener("click", (e) => {
      if (!bar.contains(e.target)) closeAll();
    });
  }

  unmount() {
    this._resizeObserver?.disconnect();
    this._sessionCleanup?.();
    this._sidebar?.destroy();
    this._term?.dispose();
    this._term = null;
    this._fitAddon = null;
    this._searchAddon = null;
    this._sessionCleanup = null;
    this._sidebar = null;
    this._logLines = [];
    this._resizeObserver = null;
    this._containerEl = null;
    this._teardown();
  }
}
