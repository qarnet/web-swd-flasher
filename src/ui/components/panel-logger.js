import { downloadLog } from "../log-panel-helpers.js";

const MAX_LINES = 5000;

export function createPanelLogger(rootEl, { source } = {}) {
  const logEl = (typeof rootEl.querySelector === "function" ? rootEl.querySelector("pre.log") : null) || rootEl;
  const lines = [];

  function log(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    lines.push(line);
    while (lines.length > MAX_LINES) lines.shift();
    logEl.textContent = lines.join("\n") + "\n";
  }

  function clearLog() {
    logEl.textContent = "";
    lines.length = 0;
  }

  function downloadLogContent(prefix = "log") {
    downloadLog(lines.join("\n") + "\n", `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
  }

  return { log, clearLog, downloadLogContent, get lines() { return lines; } };
}
