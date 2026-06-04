function _uuid() {
  return crypto.randomUUID ? crypto.randomUUID() :
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
}

export class QueueRunner {
  constructor({ send, delay = (ms) => new Promise(r => setTimeout(r, ms)) }) {
    this._send = send;
    this._delay = delay;
    this._items = [];
    this._running = false;
    this._stopRequested = false;
    this._listeners = { change: new Set(), running: new Set(), itemSent: new Set(), itemFailed: new Set() };
  }

  setItems(items) {
    this._items = items.map(it => ({
      id: it.id || _uuid(),
      text: it.text || "",
      delayMs: typeof it.delayMs === "number" ? it.delayMs : 0,
      status: it.status || "pending",
      error: it.error || undefined,
    }));
    this._emit("change");
  }

  getItems() { return this._items; }

  on(event, cb) {
    this._listeners[event]?.add(cb);
    return () => { this._listeners[event]?.delete(cb); };
  }

  _emit(event, payload) {
    for (const cb of this._listeners[event] || []) {
      try { cb(payload); } catch {}
    }
  }

  push(text) {
    this._items.push({ id: _uuid(), text, delayMs: 0, status: "pending" });
    this._emit("change");
  }

  remove(id) {
    const idx = this._items.findIndex(it => it.id === id);
    if (idx < 0) return;
    if (this._items[idx].status === "running") return;
    this._items.splice(idx, 1);
    this._emit("change");
  }

  setDelay(id, ms) {
    const item = this._items.find(it => it.id === id);
    if (!item) return;
    item.delayMs = Math.max(0, Math.min(600000, ms));
    this._emit("change");
  }

  clear() {
    if (this._running) return false;
    this._items = [];
    this._emit("change");
    return true;
  }

  isRunning() { return this._running; }

  start() {
    if (this._running) return;
    this._stopRequested = false;
    this._run();
  }

  stop() {
    this._stopRequested = true;
  }

  async _run() {
    this._running = true;
    this._emit("running", true);
    for (const item of this._items) {
      if (this._stopRequested) break;
      if (item.status === "done") continue;
      item.status = "running";
      item.error = undefined;
      this._emit("change");
      try {
        await this._delay(item.delayMs);
        if (this._stopRequested) { item.status = "pending"; break; }
        await this._send(item.text);
        item.status = "done";
        this._emit("change");
        this._emit("itemSent", item);
      } catch (err) {
        item.status = "failed";
        item.error = err.message || String(err);
        this._emit("change");
        this._emit("itemFailed", { item, error: err });
        break;
      }
    }
    this._stopRequested = false;
    this._running = false;
    this._emit("running", false);
  }
}
