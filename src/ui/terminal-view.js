export class TerminalView {
  constructor({
    buffer,
    rootEl,
    autoScroll = true,
    onLinePainted,
  }) {
    this._buffer = buffer;
    this._rootEl = rootEl;
    this._autoScroll = autoScroll;
    this._onLinePainted = onLinePainted || null;
    this._renderedLines = 0;
    this._pendingEl = null;
    this._rafScheduled = false;
    this._rafId = null;
    this._destroyed = false;
    this._pendingDelta = newDelta();
    this._unsub = buffer.on("change", (delta) => this._onChange(delta));
    this._schedule = globalThis.requestAnimationFrame
      ? (cb) => globalThis.requestAnimationFrame(cb)
      : (cb) => queueMicrotask(cb);
    this._cancelSchedule = globalThis.cancelAnimationFrame
      ? (id) => globalThis.cancelAnimationFrame(id)
      : () => {};
  }

  setAutoScroll(flag) {
    this._autoScroll = flag;
  }

  destroy() {
    this._destroyed = true;
    this._unsub();
    if (this._rafId !== null) {
      this._cancelSchedule(this._rafId);
      this._rafId = null;
    }
    this._rootEl.replaceChildren();
    this._buffer = null;
  }

  _onChange(delta) {
    if (!this._buffer) return;
    if (delta.cleared) {
      this._pendingDelta = { added: 0, pendingDirty: false, dropped: 0, cleared: true };
    } else {
      this._pendingDelta.added += delta.added;
      this._pendingDelta.dropped += delta.dropped;
      this._pendingDelta.pendingDirty = this._pendingDelta.pendingDirty || delta.pendingDirty;
    }
    if (!this._rafScheduled) {
      this._rafScheduled = true;
      this._rafId = this._schedule(() => this._paint());
    }
  }

  _paint() {
    if (this._destroyed) return;
    this._rafId = null;
    this._rafScheduled = false;
    const delta = this._pendingDelta;
    this._pendingDelta = newDelta();

    if (delta.cleared) {
      this._rootEl.replaceChildren();
      this._renderedLines = 0;
      this._pendingEl = null;
      if (this._autoScroll) this._scrollToBottom();
      return;
    }

    if (delta.dropped > 0) {
      const toRemove = Math.min(delta.dropped, this._renderedLines);
      for (let i = 0; i < toRemove; i++) this._rootEl.firstChild?.remove();
      this._renderedLines -= toRemove;
    }

    if (this._pendingEl && (delta.added > 0 || delta.pendingDirty)) {
      this._pendingEl.remove();
      this._pendingEl = null;
    }

    if (delta.added > 0) {
      const lines = this._buffer.lines;
      const from = this._renderedLines;
      const frag = document.createDocumentFragment();
      for (let i = from; i < lines.length; i++) {
        const lineEl = this._renderLine(lines[i]);
        frag.appendChild(lineEl);
        if (this._onLinePainted) this._onLinePainted(lineEl, i);
      }
      this._rootEl.appendChild(frag);
      this._renderedLines = lines.length;
    }

    const pending = this._buffer.pending;
    if (pending) {
      this._pendingEl = this._renderLine(pending, true);
      this._rootEl.appendChild(this._pendingEl);
    }

    if (this._autoScroll) this._scrollToBottom();
  }

  _renderLine(line, isPending = false) {
    const div = document.createElement("div");
    div.className = isPending ? "term-line term-line-pending" : "term-line";
    div.dataset.source = line.source;
    for (const run of line.runs) {
      const style = this._runStyle(run);
      if (style) {
        const span = document.createElement("span");
        span.textContent = run.text;
        span.setAttribute("style", style);
        div.appendChild(span);
      } else {
        div.appendChild(document.createTextNode(run.text));
      }
    }
    return div;
  }

  _runStyle(run) {
    const parts = [];
    if (run.fg) parts.push(`color:${run.bold ? "#fff" : run.dim ? run.fg + "80" : run.fg}`);
    if (run.bg) parts.push(`background:${run.bg}`);
    if (run.bold) parts.push("font-weight:bold");
    if (run.dim) parts.push("opacity:0.6");
    return parts.length ? parts.join(";") : null;
  }

  _scrollToBottom() {
    this._rootEl.scrollTop = this._rootEl.scrollHeight;
  }
}

function newDelta() {
  return { added: 0, pendingDirty: false, dropped: 0, cleared: false };
}
