import { downloadLog, autoScrollObserver } from "./log-panel-helpers.js";

let statusEl, logEl, statusLed, topbarTarget;
let verbose = false;
let verboseLogLines = [];

export function init(elements) {
  statusEl = elements.statusEl;
  logEl = elements.logEl;
  statusLed = elements.statusLed;
  topbarTarget = elements.topbarTarget;
  if (logEl && elements.chkVerbose) {
    autoScrollObserver(logEl, elements.chkVerbose);
  }
}

export function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  verboseLogLines.push(line);
  logEl.textContent += `${line}\n`;
}

export function logVerbose(message) {
  if (!verbose) return;
  const line = `[${new Date().toISOString()}] ${message}`;
  verboseLogLines.push(line);
  logEl.textContent += `${line}\n`;
}

export function setVerbose(v) {
  verbose = !!v;
}

export function isVerbose() {
  return verbose;
}

export function setStatus(message) {
  statusEl.textContent = message;
  log(message);
}

export function setLed(on) {
  if (on) {
    statusLed.classList.add("on");
  } else {
    statusLed.classList.remove("on");
  }
}

export function setTopbarTarget(text) {
  topbarTarget.textContent = text;
}

export function downloadLogContent() {
  downloadLog(verboseLogLines.join("\n") + "\n", `event-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
}

export function clearLog() {
  logEl.textContent = "";
  verboseLogLines = [];
}