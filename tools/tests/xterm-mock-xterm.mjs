export class Terminal {
  constructor(opts = {}) {
    this.opts = opts;
    this.written = [];
    this.writelnCalls = [];
    this.dataHandlers = [];
    this.disposed = false;
    this._options = { fontSize: opts.fontSize || 14, theme: opts.theme || {} };
  }
  loadAddon(addon) { this._loadedAddons = this._loadedAddons || []; this._loadedAddons.push(addon); }
  open(parent) { this._opened = true; this._parent = parent; }
  write(text) { this.written.push(text); }
  writeln(text) { this.writelnCalls.push(text); this.written.push(text + "\n"); }
  onData(handler) { this.dataHandlers.push(handler); }
  focus() { this._focused = true; }
  clear() { this._cleared = true; this.written = []; }
  dispose() { this.disposed = true; }
  get options() { return this._options; }
  set options(v) { this._options = v; }
  resize() {}
}
