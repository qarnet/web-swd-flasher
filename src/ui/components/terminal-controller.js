import {
  pushHistory,
  getHistory,
  clearHistory,
  subscribe as subscribeHistory,
} from "./terminal-history-store.js";
import {
  getTemplates,
  getVarValues,
  saveTemplate,
  deleteTemplate as deleteTpl,
  setVarValue,
  resolve,
  subscribe as subscribeTemplates,
} from "./terminal-template-store.js";
import { QueueRunner } from "./terminal-queue-runner.js";
import { SearchIndex } from "./terminal-search-index.js";
import {
  highlightMatches,
  clearHighlights,
  setCurrentMatch,
} from "../views/terminal-match-highlighter.js";

export class TerminalController {
  constructor({
    root,
    inputEl,
    sendBtnEl,
    buffer,
    view,
    channelId,
    send,
    isReady,
    logger,
  }) {
    this._root = root;
    this._inputEl = inputEl;
    this._sendBtnEl = sendBtnEl;
    this._buffer = buffer;
    this._view = view;
    this._channelId = channelId;
    this._send = send;
    this._isReady = isReady;
    this._logger = logger || { log: () => {} };

    this._echoEnabled = localStorage.getItem(`terminal:echo:${channelId}`) !== "false";
    this._searchOpen = false;

    this._history = { cursor: -1, draft: null };
    this._searchIndex = new SearchIndex(buffer);
    this._currentMatchIndex = -1;

    const echoChk = this._root.querySelector(`#chk-${channelId}-echo`);
    if (echoChk) {
      echoChk.checked = this._echoEnabled;
      this._echoChk = echoChk;
      this._boundEchoChange = () => {
        this._echoEnabled = echoChk.checked;
        localStorage.setItem(`terminal:echo:${channelId}`, String(echoChk.checked));
      };
      echoChk.addEventListener("change", this._boundEchoChange);
    }

    this._queueRunner = new QueueRunner({
      send: async (text) => {
        await this._send(text);
      },
    });
    this._restoreQueue();
    this._queueRunner.on("change", () => this._persistQueue());
    this._queueRunner.on("itemSent", (item) => {
      pushHistory(item.text);
      if (this._echoEnabled) {
        this._buffer.appendString("\n");
        this._buffer.appendString(
          `\x1b[2m${item.text}\x1b[0m\n`,
          { source: "tx" },
        );
      }
      this._renderQueue();
    });
    this._queueRunner.on("itemFailed", ({ item, error }) => {
      this._logger.log(`Queue item failed: ${error.message}`);
      this._renderQueue();
    });
    this._queueRunner.on("running", () => this._renderQueue());

    if (this._sendBtnEl && this._sendBtnEl.parentNode) {
      const queueBtn = document.createElement("button");
      queueBtn.textContent = "Queue";
      queueBtn.className = "btn-queue";
      queueBtn.addEventListener("click", () => {
        const v = this._inputEl.value;
        if (!v) return;
        this._queueRunner.push(v);
        this._inputEl.value = "";
        this._inputEl.focus();
        this._renderQueue();
      });
      this._sendBtnEl.parentNode.insertBefore(queueBtn, this._sendBtnEl);
    }

    this._filterMode = "off";
    this._restoreFilter();

    this._boundKeyDown = (e) => this._onKeyDown(e);
    this._boundSendClick = () => this._onSendClick();
    this._inputEl.addEventListener("keydown", this._boundKeyDown);
    if (this._sendBtnEl) {
      this._sendBtnEl.addEventListener("click", this._boundSendClick);
    }

    this._onDocClick = () => {
      const menu = this._root.querySelector(".more-menu");
      if (menu) menu.style.display = "none";
    };
    document.addEventListener("click", this._onDocClick);

    this._boundInput = () => {
      if (this._inputEl.value.startsWith("!") && !this._historyPopupOpen()) {
        this._popupSavedInput = this._inputEl.value;
        this._openHistoryPopup();
      }
      if (this._historyPopupOpen()) {
        if (!this._inputEl.value.startsWith("!")) {
          this._closeHistoryPopup(false);
        } else {
          this._popupFilter();
        }
      }
    };
    this._inputEl.addEventListener("input", this._boundInput);

    this._view.setAutoScroll(this._view._autoScroll);
    view._onLinePainted = (lineEl, lineIndex) => {
      if (this._searchIndex.query) {
        highlightMatches(lineEl, this._searchIndex);
      }
      if (this._filterMode !== "off") {
        this._applyFilterToLine(lineEl);
      }
    };

    this._historyUnsub = subscribeHistory(() => {});
    this._templatesUnsub = subscribeTemplates(() => this._renderTemplates());

    this._injectLayout();
    this._renderTemplates();
    this._renderQueue();
  }

  notifyReadyChange() {
    this._updateSendBtn();
  }

  destroy() {
    this._inputEl.removeEventListener("keydown", this._boundKeyDown);
    this._inputEl.removeEventListener("input", this._boundInput);
    if (this._sendBtnEl) {
      this._sendBtnEl.removeEventListener("click", this._boundSendClick);
    }
    if (this._echoChk) {
      this._echoChk.removeEventListener("change", this._boundEchoChange);
    }
    document.removeEventListener("click", this._onDocClick);
    this._historyUnsub?.();
    this._templatesUnsub?.();
    this._queueRunner.stop();
    this._searchIndex?.destroy();
    this._unwrapLayout();
    this._root.querySelector(".terminal-templates")?.remove();
    this._root.querySelector(".terminal-queue")?.remove();
    const popup = this._root.querySelector(".history-popup");
    if (popup) popup.remove();
    const menu = this._root.querySelector(".more-menu");
    if (menu) menu.remove();
  }

  _injectLayout() {
    const panelEl = this._root.closest(".panel") || this._root;

    const main = document.createElement("div");
    main.className = "terminal-main";

    const templates = document.createElement("aside");
    templates.className = "terminal-templates";
    templates.dataset.channel = this._channelId;
    templates.innerHTML = '<ul class="template-list"></ul><button class="template-new">+ New template</button>';
    templates.querySelector(".template-new").addEventListener("click", () => this._showTemplateEditor());

    const queueEl = document.createElement("aside");
    queueEl.className = "terminal-queue";

    while (panelEl.children.length > 0) {
      main.appendChild(panelEl.children[0]);
    }

    const h2 = main.querySelector("h2");
    if (h2) h2.remove();

    const rows = main.querySelectorAll(".row");
    for (const row of rows) {
      const hasClear = row.querySelector('[id$="clear" i], .tbar-clear, [id*="clear" i]');
      const hasDownload = row.querySelector('[id$="download" i], [id*="download" i]');
      const hasChecks = row.querySelector('input[type="checkbox"]');
      if ((hasClear || hasDownload) && hasChecks) {
        row.style.display = "none";
      }
    }

    this._createToolbar(main);

    this._collapseEventLog(panelEl);

    panelEl.classList.add("terminal-panel-grid");
    panelEl.style.position = "relative";
    panelEl.appendChild(templates);
    panelEl.appendChild(main);
    panelEl.appendChild(queueEl);
  }

  _unwrapLayout() {
    const panelEl = this._root.closest(".panel") || this._root;
    panelEl.classList.remove("terminal-panel-grid", "terminal-fullscreen");
    panelEl.style.position = "";
    const main = panelEl.querySelector(".terminal-main");
    if (main) {
      while (main.children.length > 0) {
        panelEl.appendChild(main.children[0]);
      }
      main.remove();
    }
  }

  _collapseEventLog(panelEl) {
    const eventLogPanel = panelEl.parentElement?.querySelector("#event-log-panel, #serial-event-log-panel");
    if (!eventLogPanel) return;
    const h2 = eventLogPanel.querySelector("h2");
    if (!h2) return;

    let collapsed = true;
    const wrapper = document.createElement("div");
    wrapper.className = "event-log-toggle";
    wrapper.innerHTML = '<span class="arrow">\u25B6</span> Event Log';
    h2.parentNode.insertBefore(wrapper, h2);
    h2.style.display = "none";

    const row = eventLogPanel.querySelector(".row");
    const logPre = eventLogPanel.querySelector("pre.log, .log-collapsed");
    if (row) row.classList.add("event-log-collapsed");
    if (logPre) logPre.classList.add("event-log-collapsed");

    wrapper.addEventListener("click", () => {
      collapsed = !collapsed;
      const arrow = wrapper.querySelector(".arrow");
      arrow.classList.toggle("open", !collapsed);
      if (row) row.classList.toggle("event-log-collapsed", collapsed);
      if (logPre) logPre.classList.toggle("event-log-collapsed", collapsed);
    });
  }

  _createToolbar(main) {
    const logEl = this._view._rootEl;
    const logWrapper = document.createElement("div");
    logWrapper.className = "terminal-log-wrapper";
    logEl.parentNode.insertBefore(logWrapper, logEl);
    logWrapper.appendChild(logEl);

    const bar = document.createElement("div");
    bar.className = "terminal-toolbar";

    const makeDropBtn = (label, title, panelEl) => {
      const btn = document.createElement("button");
      btn.className = "toolbar-btn";
      btn.textContent = label;
      btn.title = title;
      let open = false;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        open = !open;
        if (open) {
          closeAllExcept(panelEl);
          panelEl.style.display = "block";
          btn.classList.add("active");
        } else {
          panelEl.style.display = "none";
          btn.classList.remove("active");
        }
      });
      return btn;
    };

    const settingsPanel = this._createSettingsPanel();
    const searchPanel = this._createSearchPanel();
    logWrapper.appendChild(settingsPanel);
    logWrapper.appendChild(searchPanel);

    const settingsBtn = makeDropBtn("\u2699", "Settings", settingsPanel);
    const searchBtn = makeDropBtn("\u{1F50D}", "Search", searchPanel);

    const fullscreenBtn = document.createElement("button");
    fullscreenBtn.className = "toolbar-btn";
    fullscreenBtn.textContent = "\u26F6";
    fullscreenBtn.title = "Fullscreen";
    let fs = false;
    fullscreenBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      fs = !fs;
      const panel = this._root.closest(".terminal-panel-grid") || this._root;
      panel.classList.toggle("terminal-fullscreen", fs);
    });

    bar.appendChild(searchBtn);
    bar.appendChild(settingsBtn);
    bar.appendChild(fullscreenBtn);
    logWrapper.appendChild(bar);

    const closeAllExcept = (keep) => {
      [settingsPanel, searchPanel].forEach(p => {
        if (p !== keep) p.style.display = "none";
      });
      bar.querySelectorAll(".toolbar-btn.active").forEach(b => {
        if ((keep === settingsPanel && b === settingsBtn) ||
            (keep === searchPanel && b === searchBtn)) return;
        b.classList.remove("active");
      });
    };

    const closeAll = () => {
      settingsPanel.style.display = "none";
      searchPanel.style.display = "none";
      bar.querySelectorAll(".toolbar-btn.active").forEach(b => b.classList.remove("active"));
    };

    bar.addEventListener("mousedown", (e) => e.stopPropagation());
    document.addEventListener("click", (e) => {
      if (!bar.contains(e.target) && !settingsPanel.contains(e.target) && !searchPanel.contains(e.target)) {
        closeAll();
      }
    });

    this._toolbarCloseAll = closeAll;
  }

  _createSettingsPanel() {
    const panel = document.createElement("div");
    panel.className = "terminal-dropdown";
    panel.style.display = "none";

    const actions = document.createElement("div");
    actions.className = "dd-actions";
    actions.innerHTML = `
      <button class="dd-clear">Clear</button>
      <button class="dd-download">Download</button>
    `;
    panel.appendChild(actions);

    const checks = document.createElement("div");
    checks.className = "dd-checks";

    const main = this._view._rootEl.parentNode;
    const autoChk = main.querySelector("#chk-" + this._channelId + "-autoscroll");
    const crChk = main.querySelector("#chk-" + this._channelId + "-cr-newline");
    const echoChk = main.querySelector("#chk-" + this._channelId + "-echo");

    const addChk = (el, label) => {
      if (!el) return;
      const wrap = document.createElement("label");
      wrap.className = "checkbox-label";
      wrap.appendChild(el);
      wrap.appendChild(document.createTextNode(" " + label));
      checks.appendChild(wrap);
    };
    addChk(autoChk, "Scroll");
    addChk(crChk, "CR→NL");
    addChk(echoChk, "Echo");
    panel.appendChild(checks);

    actions.querySelector(".dd-clear").addEventListener("click", () => this._buffer.clear());
    actions.querySelector(".dd-download").addEventListener("click", () => {
      const blob = new Blob([this._buffer.toPlainText()], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${this._channelId}-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    return panel;
  }

  _createSearchPanel() {
    const panel = document.createElement("div");
    panel.className = "terminal-dropdown terminal-search-panel";
    panel.style.display = "none";

    const bar = document.createElement("div");
    bar.className = "search-inline";
    bar.innerHTML = `
      <input type="text" class="search-query" placeholder="Search log\u2026" />
      <label><input type="checkbox" class="search-regex" /> Regex</label>
      <select class="search-filter-mode">
        <option value="off">Off</option>
        <option value="whitelist">Whitelist</option>
        <option value="blacklist">Blacklist</option>
      </select>
      <span class="search-count">0 of 0</span>
      <button class="search-prev">Prev</button>
      <button class="search-next">Next</button>
      <button class="search-close" title="Close search">\u2715</button>
      <span style="position:relative;">
        <button class="search-more" aria-label="More">\u22ef</button>
        <ul class="more-menu" style="display:none;position:absolute;right:0;">
          <li class="more-clear-history">Clear shared history</li>
        </ul>
      </span>
    `;
    panel.appendChild(bar);

    const queryInput = bar.querySelector(".search-query");
    const regexChk = bar.querySelector(".search-regex");
    const filterSelect = bar.querySelector(".search-filter-mode");
    const countEl = bar.querySelector(".search-count");
    const prevBtn = bar.querySelector(".search-prev");
    const nextBtn = bar.querySelector(".search-next");
    const closeBtn = bar.querySelector(".search-close");
    const moreBtn = bar.querySelector(".search-more");
    const moreMenu = bar.querySelector(".more-menu");
    const clearHistoryItem = bar.querySelector(".more-clear-history");

    queryInput.addEventListener("input", () => {
      const mode = regexChk.checked ? "regex" : "plain";
      this._searchIndex.setQuery(queryInput.value, mode);
      this._refreshSearch();
    });

    regexChk.addEventListener("change", () => {
      const mode = regexChk.checked ? "regex" : "plain";
      this._searchIndex.setQuery(queryInput.value, mode);
      this._refreshSearch();
    });

    filterSelect.addEventListener("change", () => {
      this._filterMode = filterSelect.value;
      this._persistFilter();
      this._applyFilterToAll();
    });

    prevBtn.addEventListener("click", () => {
      this._currentMatchIndex--;
      setCurrentMatch(this._view._rootEl, this._currentMatchIndex, this._searchIndex);
      this._updateSearchCount(countEl);
    });

    nextBtn.addEventListener("click", () => {
      this._currentMatchIndex++;
      setCurrentMatch(this._view._rootEl, this._currentMatchIndex, this._searchIndex);
      this._updateSearchCount(countEl);
    });

    closeBtn.addEventListener("click", () => {
      this._searchIndex.setQuery("", "plain");
      queryInput.value = "";
      regexChk.checked = false;
      filterSelect.value = "off";
      this._filterMode = "off";
      this._persistFilter();
      this._refreshAllLines();
      this._applyFilterToAll();
      this._updateSearchCount(countEl);
      this._view.setAutoScroll(this._view._autoScroll);
      panel.style.display = "none";
      this._toolbarCloseAll?.();
    });

    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moreMenu.style.display = moreMenu.style.display === "none" ? "block" : "none";
    });

    clearHistoryItem.addEventListener("click", () => {
      if (confirm("Clear shared command history?")) clearHistory();
      moreMenu.style.display = "none";
    });

    queryInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeBtn.click();
    });

    panel.addEventListener("mousedown", (e) => e.stopPropagation());

    return panel;
  }

  _refreshSearch() {
    this._searchIndex.rebuildIfNeeded();
    this._currentMatchIndex = -1;
    if (this._searchIndex.query) {
      this._view.setAutoScroll(false);
      this._refreshAllLines();
    } else {
      this._view.setAutoScroll(true);
      this._clearAllHighlights();
    }
    this._applyFilterToAll();
    const countEl = this._root.querySelector(".search-count");
    if (countEl) this._updateSearchCount(countEl);
  }

  _refreshAllLines() {
    const children = this._view._rootEl.children;
    for (const child of children) {
      if (child.classList.contains("term-line") && !child.classList.contains("term-line-pending")) {
        clearHighlights(child);
        if (this._searchIndex.query) highlightMatches(child, this._searchIndex);
      }
    }
  }

  _clearAllHighlights() {
    const children = this._view._rootEl.children;
    for (const child of children) {
      if (child.classList.contains("term-line")) {
        clearHighlights(child);
      }
    }
  }

  _updateSearchCount(countEl) {
    this._searchIndex.rebuildIfNeeded();
    const total = this._searchIndex.matches.length;
    const current = total > 0 ? ((this._currentMatchIndex % total) + total) % total + 1 : 0;
    countEl.textContent = `${current} of ${total}`;
  }

  _applyFilterToLine(lineEl) {
    if (lineEl.classList.contains("term-line-pending")) {
      lineEl.hidden = false;
      return;
    }
    const text = lineEl.textContent;
    const matches = this._searchIndex.matchLine(text);
    if (this._filterMode === "whitelist") {
      lineEl.hidden = !matches;
    } else if (this._filterMode === "blacklist") {
      lineEl.hidden = matches;
    } else {
      lineEl.hidden = false;
    }
  }

  _applyFilterToAll() {
    const children = this._view._rootEl.children;
    for (const child of children) {
      if (child.classList.contains("term-line")) {
        this._applyFilterToLine(child);
      }
    }
  }

  _persistFilter() {
    localStorage.setItem(`terminal:filter:${this._channelId}`, JSON.stringify({
      mode: this._filterMode,
      pattern: this._searchIndex.query,
      isRegex: this._searchIndex.mode === "regex",
    }));
  }

  _restoreFilter() {
    try {
      const raw = localStorage.getItem(`terminal:filter:${this._channelId}`);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.mode && data.mode !== "off") {
        this._filterMode = data.mode;
        if (data.pattern) {
          this._searchIndex.setQuery(data.pattern, data.isRegex ? "regex" : "plain");
          const queryInput = this._root.querySelector(".search-query");
          const regexChk = this._root.querySelector(".search-regex");
          const filterSelect = this._root.querySelector(".search-filter-mode");
          if (queryInput) queryInput.value = data.pattern;
          if (regexChk) regexChk.checked = !!data.isRegex;
          if (filterSelect) filterSelect.value = data.mode;
        }
      }
    } catch {}
  }

  _persistQueue() {
    const items = this._queueRunner.getItems();
    if (items.length === 0) {
      localStorage.removeItem(`terminal:queue:${this._channelId}`);
    } else {
      localStorage.setItem(`terminal:queue:${this._channelId}`, JSON.stringify(items));
    }
  }

  _restoreQueue() {
    try {
      const raw = localStorage.getItem(`terminal:queue:${this._channelId}`);
      if (raw) {
        const items = JSON.parse(raw);
        if (Array.isArray(items)) this._queueRunner.setItems(items);
      }
    } catch {}
  }

  _onSendClick() {
    if (this._queueRunner.isRunning()) return;
    this._performSend(this._inputEl.value);
  }

  _onKeyDown(e) {
    if (e.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (this._queueRunner.isRunning()) return;
      if (this._historyPopupOpen()) {
        this._popupHandleEnter();
        return;
      }
      this._performSend(this._inputEl.value);
      return;
    }
    if (e.key === "ArrowUp") {
      if (this._historyPopupOpen()) { e.preventDefault(); this._popupNav(-1); return; }
      e.preventDefault();
      this._historyUp();
      return;
    }
    if (e.key === "ArrowDown") {
      if (this._historyPopupOpen()) { e.preventDefault(); this._popupNav(1); return; }
      e.preventDefault();
      this._historyDown();
      return;
    }
    if (e.key === "Escape") {
      if (this._historyPopupOpen()) {
        e.preventDefault();
        this._closeHistoryPopup(true);
        return;
      }
    }

    if (this._history.cursor !== -1 && this._inputEl.value !== this._getHistoryEntry()) {
      this._history = { cursor: -1, draft: null };
    }
  }

  _historyUp() {
    const h = getHistory();
    if (h.length === 0) return;
    if (this._history.cursor === -1) {
      this._history.draft = this._inputEl.value;
      this._history.cursor = h.length - 1;
    } else if (this._history.cursor > 0) {
      this._history.cursor--;
    }
    this._inputEl.value = h[this._history.cursor];
  }

  _historyDown() {
    const h = getHistory();
    if (this._history.cursor === -1) return;
    if (this._history.cursor < h.length - 1) {
      this._history.cursor++;
      this._inputEl.value = h[this._history.cursor];
    } else {
      this._inputEl.value = this._history.draft ?? "";
      this._history = { cursor: -1, draft: null };
    }
  }

  _getHistoryEntry() {
    const h = getHistory();
    if (this._history.cursor >= 0 && this._history.cursor < h.length) {
      return h[this._history.cursor];
    }
    return null;
  }

  async _performSend(text) {
    const trimmed = text;
    if (!trimmed || !this._isReady()) return;
    try {
      await this._send(trimmed);
      pushHistory(trimmed);
      if (this._echoEnabled) {
        this._buffer.appendString("\n");
        this._buffer.appendString(
          `\x1b[2m${trimmed}\x1b[0m\n`,
          { source: "tx" },
        );
      }
      this._inputEl.value = "";
      this._history = { cursor: -1, draft: null };
    } catch (err) {
      this._logger.log(`${this._channelId} send failed: ${err.message}`);
    }
  }

  _historyPopupOpen() {
    return !!this._root.querySelector(".history-popup");
  }

  _openHistoryPopup() {
    const existing = this._root.querySelector(".history-popup");
    if (existing) existing.remove();

    this._popupSavedInput = this._inputEl.value;

    const inputRect = this._inputEl.getBoundingClientRect();
    const rootRect = this._root.getBoundingClientRect();

    const ul = document.createElement("ul");
    ul.className = "history-popup";
    ul.setAttribute("role", "listbox");
    ul.style.top = `${inputRect.bottom - rootRect.top + 4}px`;
    ul.style.left = `${inputRect.left - rootRect.left}px`;
    ul.style.width = `${inputRect.offsetWidth}px`;

    this._root.appendChild(ul);
    this._popupFilter();
  }

  _closeHistoryPopup(restore) {
    const popup = this._root.querySelector(".history-popup");
    if (!popup) return;
    if (restore) {
      this._inputEl.value = this._popupSavedInput ?? "";
    }
    this._popupSelectedIndex = undefined;
    popup.remove();
  }

  _popupFilter() {
    const popup = this._root.querySelector(".history-popup");
    if (!popup) return;
    const query = this._inputEl.value.replace(/^!/, "").toLowerCase();
    const h = getHistory();
    let filtered = query
      ? h.filter(e => e.toLowerCase().includes(query)).reverse()
      : [...h].reverse().slice(0, 20);

    popup.innerHTML = "";
    if (filtered.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No matches";
      li.style.color = "var(--muted)";
      popup.appendChild(li);
      return;
    }

    const maxRows = 8;
    const visible = filtered.slice(0, maxRows);
    for (let i = 0; i < visible.length; i++) {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.id = `hpop-i-${i}`;
      li.textContent = visible[i];
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this._inputEl.value = visible[i];
        this._closeHistoryPopup(false);
      });
      popup.appendChild(li);
    }
    if (filtered.length > maxRows) {
      const li = document.createElement("li");
      li.textContent = `+${filtered.length - maxRows} more`;
      li.style.color = "var(--muted)";
      popup.appendChild(li);
    }
  }

  _popupNav(dir) {
    const popup = this._root.querySelector(".history-popup");
    if (!popup) return;
    const items = popup.querySelectorAll('li[role="option"]');
    if (items.length === 0) return;
    if (this._popupSelectedIndex === undefined) {
      this._popupSelectedIndex = dir < 0 ? items.length - 1 : 0;
    } else {
      this._popupSelectedIndex = (this._popupSelectedIndex + dir + items.length) % items.length;
    }
    for (const item of items) item.setAttribute("aria-selected", "false");
    items[this._popupSelectedIndex].setAttribute("aria-selected", "true");
  }

  _popupHandleEnter() {
    const popup = this._root.querySelector(".history-popup");
    if (!popup) return;
    const selected = popup.querySelector('li[role="option"][aria-selected="true"]');
    if (selected) {
      this._inputEl.value = selected.textContent;
      this._closeHistoryPopup(false);
    } else {
      this._closeHistoryPopup(false);
    }
  }

  _renderTemplates() {
    const aside = this._root.querySelector(".terminal-templates");
    if (!aside) return;
    const list = aside.querySelector(".template-list");
    if (!list) return;
    const templates = getTemplates();

    list.innerHTML = "";
    for (const tpl of templates) {
      const card = document.createElement("li");
      card.className = "template-card";
      card.innerHTML = `
        <div class="tpl-header">
          <span>${this._esc(tpl.name)}</span>
          <div>
            <button class="tpl-edit-btn" title="Edit">\u270e</button>
            <button class="tpl-delete-btn" title="Delete">\u2715</button>
          </div>
        </div>
        ${tpl.vars.map(v => {
          const val = getVarValues(tpl.id)[v] || "";
          const unset = val === "" ? '<span class="unset-chip">unset</span>' : "";
          return `<div class="tpl-var-row">
            <label>${this._esc(v)}</label>
            <input type="text" value="${this._esc(val)}" data-tpl-id="${tpl.id}" data-var="${v}" placeholder="${v}" />
            ${unset}
          </div>`;
        }).join("")}
        <div class="tpl-actions">
          <button class="tpl-buffer-btn">Buffer</button>
          <button class="tpl-send-btn">Send</button>
        </div>
      `;

      card.querySelector(".tpl-edit-btn").addEventListener("click", () => this._showTemplateEditor(tpl));
      card.querySelector(".tpl-delete-btn").addEventListener("click", () => {
        if (confirm(`Delete template "${tpl.name}"?`)) deleteTpl(tpl.id);
      });
      card.querySelector(".tpl-buffer-btn").addEventListener("click", () => {
        const vars = getVarValues(tpl.id);
        this._inputEl.value = resolve(tpl.body, vars);
        this._inputEl.focus();
      });
      card.querySelector(".tpl-send-btn").addEventListener("click", () => {
        const vars = getVarValues(tpl.id);
        const resolved = resolve(tpl.body, vars);
        this._performSend(resolved);
        card.querySelector(".tpl-send-btn").disabled = false;
      });

      const varInputs = card.querySelectorAll(".tpl-var-row input");
      for (const input of varInputs) {
        input.addEventListener("change", () => {
          setVarValue(input.dataset.tplId, input.dataset.var, input.value);
        });
      }

      list.appendChild(card);
    }
  }

  _showTemplateEditor(existing) {
    const aside = this._root.querySelector(".terminal-templates");
    if (!aside) return;
    const form = document.createElement("div");
    form.className = "template-edit-form";
    form.innerHTML = `
      <input type="text" class="tpl-edit-name" placeholder="Template name" value="${existing ? this._esc(existing.name) : ""}" maxlength="60" />
      <textarea class="tpl-edit-body" placeholder="Template body with \${VARS}" maxlength="2000">${existing ? this._esc(existing.body || "") : ""}</textarea>
      <div class="tpl-edit-actions">
        <button class="tpl-edit-save">Save</button>
        <button class="tpl-edit-cancel">Cancel</button>
      </div>
      <div class="tpl-error" style="display:none;"></div>
    `;

    const list = aside.querySelector(".template-list");
    list.insertBefore(form, list.firstChild);

    const errorEl = form.querySelector(".tpl-error");
    form.querySelector(".tpl-edit-save").addEventListener("click", () => {
      const name = form.querySelector(".tpl-edit-name").value;
      const body = form.querySelector(".tpl-edit-body").value;
      const result = saveTemplate({
        id: existing?.id,
        name,
        body,
      });
      if (!result.ok) {
        errorEl.textContent = result.reason;
        errorEl.style.display = "block";
      } else {
        form.remove();
      }
    });
    form.querySelector(".tpl-edit-cancel").addEventListener("click", () => form.remove());
  }

  _renderQueue() {
    const aside = this._root.querySelector(".terminal-queue");
    if (!aside) return;
    const items = this._queueRunner.getItems();
    const running = this._queueRunner.isRunning();

    aside.innerHTML = `
      <button class="template-new q-send-queue">${running ? "Resume Queue" : "Send Queue"}</button>
      <button class="template-new q-stop-queue" ${!running ? "disabled" : ""}>Stop</button>
      <button class="template-new q-clear-queue" ${running ? "disabled" : ""}>Clear</button>
    `;

    for (const item of items) {
      const card = document.createElement("div");
      card.className = "queue-item";
      card.innerHTML = `
        <div class="q-item-header">
          <span class="q-item-text" title="${this._esc(item.text)}">${this._esc(item.text)}</span>
          <button class="q-item-remove" ${item.status === "running" ? "disabled" : ""}>\u2715</button>
        </div>
        <div class="q-item-delay">
          Delay: <input type="number" class="q-item-delay-input" value="${item.delayMs}" min="0" max="600000" ${running ? "disabled" : ""} /> ms
        </div>
        <div class="q-item-status status-${item.status}">${item.status}${item.error ? `: ${item.error}` : ""}</div>
      `;
      card.querySelector(".q-item-remove").addEventListener("click", () => {
        this._queueRunner.remove(item.id);
        this._renderQueue();
      });
      card.querySelector(".q-item-delay-input").addEventListener("change", (e) => {
        this._queueRunner.setDelay(item.id, parseInt(e.target.value, 10) || 0);
        this._renderQueue();
      });
      aside.appendChild(card);
    }

    aside.querySelector(".q-send-queue").addEventListener("click", () => {
      this._queueRunner.start();
    });
    aside.querySelector(".q-stop-queue").addEventListener("click", () => {
      this._queueRunner.stop();
    });
    const clearBtn = aside.querySelector(".q-clear-queue");
    clearBtn.addEventListener("click", () => {
      if (running) return;
      if (items.length === 0 || confirm("Clear queue?")) {
        this._queueRunner.clear();
        this._renderQueue();
      }
    });

    this._updateSendBtn();
  }

  _updateSendBtn() {
    if (this._sendBtnEl) {
      this._sendBtnEl.disabled = this._queueRunner.isRunning() || !this._isReady();
    }
  }

  _esc(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }
}
