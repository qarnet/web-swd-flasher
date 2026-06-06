import {
  pushHistory,
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
  importTemplates,
} from "./terminal-template-store.js";
import { QueueRunner } from "./terminal-queue-runner.js";

const _SHARED_QUEUE_KEY = "terminal:queue";
let _queueListeners = new Set();
let _reloadingFromExternal = false;

function _subscribeQueueChange(cb) {
  _queueListeners.add(cb);
  return () => _queueListeners.delete(cb);
}

function _dispatchQueueChange() {
  for (const cb of _queueListeners) try { cb(); } catch {}
}

function _loadSharedQueue() {
  try {
    const raw = localStorage.getItem(_SHARED_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function _saveSharedQueue(items) {
  const slim = items.map(({ id, text, delayMs }) => ({ id, text, delayMs }));
  if (slim.length === 0) { localStorage.removeItem(_SHARED_QUEUE_KEY); }
  else { localStorage.setItem(_SHARED_QUEUE_KEY, JSON.stringify(slim)); }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === _SHARED_QUEUE_KEY) _dispatchQueueChange();
  });
}

export class TerminalSidebarController {
  constructor({ rootEl, channelId, send, isReady, logger, onTemplateBuffer }) {
    this._rootEl = rootEl;
    this._channelId = channelId;
    this._send = send;
    this._isReady = isReady;
    this._logger = logger || { log: () => {} };
    this._onTemplateBufferCb = onTemplateBuffer || (() => {});
    this._templatesAside = null;
    this._queueAside = null;
    this._queueRunner = null;
    this._templatesUnsub = null;
    this._historyUnsub = null;
    this._queueUnsub = null;
  }

  get queueRunner() { return this._queueRunner; }

  mount() {
    this._templatesAside = document.createElement("aside");
    this._templatesAside.className = "terminal-templates";
    this._templatesAside.dataset.channel = this._channelId;
    this._templatesAside.innerHTML = '<div class="sidebar-title">Templates</div><ul class="template-list"></ul><button class="template-new">+ New template</button>';
    this._templatesAside.querySelector(".template-new").addEventListener("click", () => this._showTemplateEditor());

    this._queueAside = document.createElement("aside");
    this._queueAside.className = "terminal-queue";
    this._queueAside.innerHTML = '<div class="sidebar-title">Command Queue</div>';

    this._rootEl.appendChild(this._templatesAside);
    this._rootEl.appendChild(this._queueAside);

    this._queueRunner = new QueueRunner({
      send: async (text) => { await this._send(text); },
    });
    this._queueRunner.setItems(_loadSharedQueue());
    this._queueRunner.on("change", () => {
      if (!_reloadingFromExternal) {
        _saveSharedQueue(this._queueRunner.getItems());
        _dispatchQueueChange();
      }
    });
    this._queueUnsub = _subscribeQueueChange(() => {
      _reloadingFromExternal = true;
      this._queueRunner.setItems(_loadSharedQueue());
      _reloadingFromExternal = false;
      this._renderQueue();
    });
    this._queueRunner.on("itemSent", (item) => {
      pushHistory(item.text);
      this._renderQueue();
    });
    this._queueRunner.on("itemFailed", ({ item, error }) => {
      this._logger.log(`Queue item failed: ${error.message}`);
      this._renderQueue();
    });
    this._queueRunner.on("running", () => this._renderQueue());

    this._historyUnsub = subscribeHistory(() => {});
    this._templatesUnsub = subscribeTemplates(() => this._renderTemplates());

    this._renderTemplates();
    this._renderQueue();
  }

  destroy() {
    this._templatesUnsub?.();
    this._historyUnsub?.();
    this._queueUnsub?.();
    this._queueRunner?.stop();
    this._templatesAside?.remove();
    this._queueAside?.remove();
    this._templatesAside = null;
    this._queueAside = null;
    this._queueRunner = null;
  }

  _renderTemplates() {
    const aside = this._templatesAside;
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
        const resolved = resolve(tpl.body, vars);
        this._onTemplateBuffer(resolved);
      });
      card.querySelector(".tpl-send-btn").addEventListener("click", async () => {
        const vars = getVarValues(tpl.id);
        const resolved = resolve(tpl.body, vars);
        if (resolved && this._isReady()) {
          try {
            await this._send(resolved);
            pushHistory(resolved);
          } catch (err) {
            this._logger.log(`${this._channelId} send failed: ${err.message}`);
          }
        }
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

  _onTemplateBuffer(resolved) {
    this._onTemplateBufferCb(resolved);
  }

  _showTemplateEditor(existing) {
    const aside = this._templatesAside;
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
    const aside = this._queueAside;
    if (!aside) return;
    const items = this._queueRunner.getItems();
    const running = this._queueRunner.isRunning();

    const body = document.createElement("div");
    body.innerHTML = `
      <button class="template-new q-send-queue">${running ? "Resume Queue" : "Send Queue"}</button>
      <button class="template-new q-stop-queue" ${!running ? "disabled" : ""}>Stop</button>
      <button class="template-new q-clear-queue" ${running ? "disabled" : ""}>Clear</button>
    `;

    const title = aside.querySelector(".sidebar-title");
    aside.replaceChildren(title, body);

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

    const ioRow = document.createElement("div");
    ioRow.className = "queue-actions q-io-row";
    ioRow.innerHTML = `<button class="q-export" title="Export templates + queue to JSON file">Export</button><button class="q-import" title="Import templates + queue from JSON file">Import</button>`;
    aside.appendChild(ioRow);

    aside.querySelector(".q-export").addEventListener("click", () => this._exportConfig());
    aside.querySelector(".q-import").addEventListener("click", () => this._importConfig());
  }

  _exportConfig() {
    const templates = getTemplates();
    const queue = this._queueRunner.getItems().map(({ id, text, delayMs }) => ({ id, text, delayMs }));
    const json = JSON.stringify({ version: 1, templates, queue }, null, 2);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = `terminal-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  _importConfig() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data || typeof data !== "object") throw new Error("Not a valid config file");

        let msg = [];

        if (Array.isArray(data.templates)) {
          const { added, skipped } = importTemplates(data.templates);
          msg.push(`Templates: ${added} added, ${skipped} skipped`);
        }

        if (Array.isArray(data.queue)) {
          this._queueRunner.setItems(data.queue);
          _saveSharedQueue(this._queueRunner.getItems());
          _dispatchQueueChange();
          msg.push(`Queue: ${data.queue.length} item(s) loaded`);
        }

        if (msg.length === 0) throw new Error("No templates or queue found in file");
        alert(msg.join("\n"));
      } catch (err) {
        alert(`Import failed: ${err.message}`);
      }
    });
    input.click();
  }

  _esc(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }
}
