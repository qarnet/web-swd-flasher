const ANSI_COLORS = {
  0: null,
  30: "#000",
  31: "#c23621",
  32: "#2bc464",
  33: "#c4c43d",
  34: "#5050d0",
  35: "#c43dc4",
  36: "#3dc4c4",
  37: "#b0b0b0",
  90: "#666",
  91: "#d55",
  92: "#5d5",
  93: "#dd5",
  94: "#55d",
  95: "#d5d",
  96: "#5dd",
  97: "#ddd",
};

const ANSI_BG = {
  40: "#000",
  41: "#c23621",
  42: "#2bc464",
  43: "#c4c43d",
  44: "#5050d0",
  45: "#c43dc4",
  46: "#3dc4c4",
  47: "#b0b0b0",
  100: "#666",
  101: "#d55",
  102: "#5d5",
  103: "#dd5",
  104: "#55d",
  105: "#d5d",
  106: "#5dd",
  107: "#ddd",
};

const MAX_PENDING_CHARS = 100_000;

export class TerminalBuffer {
  constructor({
    channelId,
    maxLines = 10_000,
    crAsNewline = true,
    onWarning,
  } = {}) {
    this._channelId = channelId;
    this._maxLines = maxLines;
    this._crAsNewline = crAsNewline;
    this._onWarning = onWarning || (() => {});
    this._decoder = new TextDecoder("utf-8", { fatal: false });
    this._sgr = { fg: null, bg: null, bold: false, dim: false };
    this._pendingEscape = "";
    this._ring = [];
    this._pending = null;
    this._droppedTotal = 0;
    this._listeners = new Set();
    this._pendingCharCount = 0;
  }

  append(bytes) {
    const decoded = this._decoder.decode(bytes, { stream: true });
    this._consume(decoded);
  }

  appendString(text, { source = "rx" } = {}) {
    this._consume(text, source);
  }

  setCrAsNewline(flag) {
    this._crAsNewline = flag;
  }

  clear() {
    this._decoder = new TextDecoder("utf-8", { fatal: false });
    this._sgr = { fg: null, bg: null, bold: false, dim: false };
    this._pendingEscape = "";
    this._ring = [];
    this._pending = null;
    this._droppedTotal = 0;
    this._pendingCharCount = 0;
    this._emit({ added: 0, pendingDirty: false, dropped: 0, cleared: true });
  }

  get lines() {
    return this._ring;
  }

  get pending() {
    return this._pending;
  }

  get droppedTotal() {
    return this._droppedTotal;
  }

  toPlainText() {
    const linesText = this._ring.map(l => l.runs.map(r => r.text).join("")).join("\n");
    const pendingText = this._pending ? this._pending.runs.map(r => r.text).join("") : "";
    if (this._ring.length === 0 && !this._pending) return "";
    if (!this._pending) return linesText + "\n";
    if (this._ring.length === 0) return pendingText;
    return linesText + "\n" + pendingText;
  }

  on(event, cb) {
    if (event !== "change") throw new Error(`Unknown event: ${event}`);
    this._listeners.add(cb);
    return () => { this._listeners.delete(cb); };
  }

  _emit(delta) {
    const errors = [];
    for (const cb of this._listeners) {
      try { cb(delta); } catch (e) { errors.push(e); }
    }
    for (const e of errors) {
      this._onWarning(`TerminalBuffer listener error: ${e.message}`);
    }
  }

  _consume(text, source = "rx") {
    const delta = { added: 0, pendingDirty: false, dropped: 0, cleared: false };
    let buf = this._pendingEscape + text;
    this._pendingEscape = "";
    let i = 0;
    while (i < buf.length) {
      if (buf[i] === "\x1b") {
        const mEnd = buf.indexOf("m", i + 1);
        if (mEnd === -1) { this._pendingEscape = buf.slice(i); break; }
        this._applySgr(buf.slice(i + 2, mEnd));
        i = mEnd + 1;
        continue;
      }
      let nextEsc = buf.indexOf("\x1b", i);
      if (nextEsc === -1) nextEsc = buf.length;
      this._appendChunk(buf.slice(i, nextEsc), source, delta);
      i = nextEsc;
    }
    this._emit(delta);
  }

  _applySgr(params) {
    if (!/^\d+(?:;\d+)*$/.test(params)) return;
    const codes = params.split(";").map(Number);
    for (const c of codes) {
      if (c === 0) {
        this._sgr.fg = null;
        this._sgr.bg = null;
        this._sgr.bold = false;
        this._sgr.dim = false;
      } else if (c === 1) {
        this._sgr.bold = true;
      } else if (c === 2) {
        this._sgr.dim = true;
      } else if (c === 22) {
        this._sgr.bold = false;
        this._sgr.dim = false;
      } else if (ANSI_COLORS[c]) {
        this._sgr.fg = ANSI_COLORS[c];
      } else if (c === 39) {
        this._sgr.fg = null;
      } else if (ANSI_BG[c]) {
        this._sgr.bg = ANSI_BG[c];
      } else if (c === 49) {
        this._sgr.bg = null;
      }
    }
  }

  _appendChunk(chunk, source, delta) {
    if (!chunk) return;
    const sep = this._crAsNewline ? /\r\n|\n|\r/ : /\n/;
    const pieces = chunk.split(sep);
    for (let p = 0; p < pieces.length; p++) {
      this._appendToPending(pieces[p], source, delta);
      if (p < pieces.length - 1) this._finalizePending(delta);
    }
  }

  _appendToPending(text, source, delta) {
    if (!text) return;
    if (!this._pending) { this._pending = { runs: [], source }; this._pendingCharCount = 0; }
    this._pendingCharCount += text.length;
    if (this._pendingCharCount > MAX_PENDING_CHARS) {
      this._onWarning(`TerminalBuffer[${this._channelId}]: pending line exceeded ${MAX_PENDING_CHARS} chars; force-finalising. Device may be streaming without newlines.`);
      this._finalizePending(delta);
      if (text) {
        this._pending = { runs: [], source };
        this._pendingCharCount = text.length;
      }
    }
    const last = this._pending.runs.at(-1);
    if (last && this._runMatchesSgr(last)) {
      last.text += text;
    } else {
      this._pending.runs.push({
        text,
        fg: this._sgr.fg,
        bg: this._sgr.bg,
        bold: this._sgr.bold,
        dim: this._sgr.dim,
      });
    }
    delta.pendingDirty = true;
  }

  _finalizePending(delta) {
    const line = this._pending ?? { runs: [], source: "rx" };
    this._pending = null;
    this._pendingCharCount = 0;
    this._ring.push(line);
    if (this._ring.length > this._maxLines) {
      const overflow = this._ring.length - this._maxLines;
      this._ring.splice(0, overflow);
      this._droppedTotal += overflow;
      delta.dropped += overflow;
    }
    delta.added += 1;
    delta.pendingDirty = true;
  }

  _runMatchesSgr(run) {
    return run.fg === this._sgr.fg
      && run.bg === this._sgr.bg
      && run.bold === this._sgr.bold
      && run.dim === this._sgr.dim;
  }
}
