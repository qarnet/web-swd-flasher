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
  }

  write(el, text) {
    const parts = text.split(/\x1b\[([^m]*)m/);
    let first = true;
    for (const part of parts) {
      if (first) {
        first = false;
        this._appendText(el, part);
        continue;
      }
      first = false;
      if (/^\d+(?:;\d+)*$/.test(part)) {
        const codes = part.split(";").map(Number);
        for (let i = 0; i < codes.length; i++) {
          const c = codes[i];
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
      } else {
        this._appendText(el, "\x1b[" + part + "m");
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

  reset() {
    this._fg = null;
    this._bg = null;
    this._bold = false;
    this._dim = false;
  }
}