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

export class AnsiRenderer {
  constructor() {
    this._fg = null;
    this._bg = null;
    this._bold = false;
    this._dim = false;
    this._pending = "";
    this._plainLog = "";
  }

  write(el, text) {
    text = this._pending + text;
    this._pending = "";
    let i = 0;
    while (i < text.length) {
      if (text[i] === "\x1b") {
        const mEnd = text.indexOf("m", i + 1);
        if (mEnd === -1) {
          this._pending = text.slice(i);
          break;
        }
        const params = text.slice(i + 2, mEnd);
        this._applySgr(params);
        this._plainLog += text.slice(i, mEnd + 1);
        i = mEnd + 1;
      } else {
        let nextEsc = text.indexOf("\x1b", i);
        if (nextEsc === -1) nextEsc = text.length;
        const chunk = text.slice(i, nextEsc);
        this._appendText(el, chunk);
        this._plainLog += chunk;
        i = nextEsc;
      }
    }
  }

  _applySgr(params) {
    if (!/^\d+(?:;\d+)*$/.test(params)) return;
    const codes = params.split(";").map(Number);
    for (const c of codes) {
      if (c === 0) {
        this._fg = null;
        this._bg = null;
        this._bold = false;
        this._dim = false;
      } else if (c === 1) {
        this._bold = true;
      } else if (c === 2) {
        this._dim = true;
      } else if (c === 22) {
        this._bold = false;
        this._dim = false;
      } else if (ANSI_COLORS[c]) {
        this._fg = ANSI_COLORS[c];
      } else if (c === 39) {
        this._fg = null;
      } else if (ANSI_BG[c]) {
        this._bg = ANSI_BG[c];
      } else if (c === 49) {
        this._bg = null;
      }
    }
  }

  _appendText(el, text) {
    if (!text) return;
    const style = this._currentStyle();
    if (style) {
      const span = document.createElement("span");
      span.textContent = text;
      span.setAttribute("style", style);
      el.appendChild(span);
    } else {
      el.appendChild(document.createTextNode(text));
    }
  }

  _currentStyle() {
    const parts = [];
    if (this._fg) parts.push(`color:${this._bold ? "#fff" : this._dim ? this._fg + "80" : this._fg}`);
    if (this._bg) parts.push(`background:${this._bg}`);
    if (this._bold) parts.push("font-weight:bold");
    if (this._dim) parts.push("opacity:0.6");
    return parts.length ? parts.join(";") : null;
  }

  get plainText() {
    return this._plainLog;
  }

  reset() {
    this._fg = null;
    this._bg = null;
    this._bold = false;
    this._dim = false;
    this._pending = "";
    this._plainLog = "";
  }
}