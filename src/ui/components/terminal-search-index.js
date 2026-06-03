export class SearchIndex {
  constructor(buffer) {
    this._buffer = buffer;
    this._matches = [];
    this._query = "";
    this._mode = "plain";
    this._regex = null;
    this._error = null;
    this._dirty = true;
    this._unsub = buffer.on("change", (d) => {
      if (d.cleared) this.clear();
      else this._dirty = true;
    });
  }

  setQuery(query, mode) {
    if (mode !== "plain" && mode !== "regex") mode = "plain";
    this._query = query || "";
    this._mode = mode;
    this._error = null;
    this._dirty = true;
    if (mode === "regex" && this._query) {
      try {
        this._regex = new RegExp(this._query, "gi");
      } catch (e) {
        this._error = e.message;
        this._regex = null;
        this._matches = [];
      }
    } else {
      this._regex = null;
    }
  }

  get query() { return this._query; }
  get mode() { return this._mode; }
  get matches() { return this._matches; }
  get error() { return this._error; }

  rebuildIfNeeded() {
    if (!this._dirty) return;
    this._dirty = false;
    this._matches = [];
    if (!this._query) return;

    const lines = this._buffer.lines;
    const matchFn = this._buildMatcher();
    if (!matchFn) return;

    for (let li = 0; li < lines.length; li++) {
      const text = lines[li].runs.map(r => r.text).join("");
      const hits = matchFn(text);
      for (const { start, end } of hits) {
        this._matches.push({ lineIndex: li, runStart: start, runEnd: end });
      }
    }
  }

  _buildMatcher() {
    if (!this._query) return null;
    if (this._error) return null;
    if (this._mode === "regex" && this._regex) {
      const re = this._regex;
      return (text) => {
        const hits = [];
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
          if (m[0].length === 0) { re.lastIndex++; continue; }
          hits.push({ start: m.index, end: m.index + m[0].length });
        }
        return hits;
      };
    }
    const q = this._query.toLowerCase();
    return (text) => {
      const hits = [];
      const lower = text.toLowerCase();
      let pos = 0;
      while ((pos = lower.indexOf(q, pos)) !== -1) {
        hits.push({ start: pos, end: pos + q.length });
        pos++;
      }
      return hits;
    };
  }

  matchLine(line) {
    if (!this._query || this._error) return false;
    const text = typeof line === "string"
      ? line
      : line.runs.map(r => r.text).join("");
    if (this._mode === "regex" && this._regex) {
      this._regex.lastIndex = 0;
      return this._regex.test(text);
    }
    return text.toLowerCase().includes(this._query.toLowerCase());
  }

  clear() {
    this._dirty = true;
    this._matches = [];
    this._query = "";
    this._mode = "plain";
    this._regex = null;
    this._error = null;
  }

  destroy() {
    this._unsub();
  }
}
