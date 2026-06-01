import { downloadLog } from "./log-panel-helpers.js";

let serialLogEl;
let logLines = [];

export function init(elements) {
  serialLogEl = elements.serialLogEl;
}

export function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  logLines.push(line);
  serialLogEl.textContent += `${line}\n`;
  serialLogEl.scrollTop = serialLogEl.scrollHeight;
}

export function clearLog() {
  serialLogEl.textContent = "";
  logLines = [];
}

export function downloadLogContent() {
  downloadLog(logLines.join("\n") + "\n", `serial-event-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
}