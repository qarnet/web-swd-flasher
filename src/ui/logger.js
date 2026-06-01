import { downloadLog, autoScrollObserver } from "./log-panel-helpers.js";

const MAX_LINES = 5000;

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

function trimBuffer(arr) {
  while (arr.length > MAX_LINES) arr.shift();
}

export function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  verboseLogLines.push(line);
  trimBuffer(verboseLogLines);
  logEl.textContent = verboseLogLines.join("\n") + "\n";
}

export function logVerbose(message) {
  if (!verbose) return;
  const line = `[${new Date().toISOString()}] ${message}`;
  verboseLogLines.push(line);
  trimBuffer(verboseLogLines);
  logEl.textContent = verboseLogLines.join("\n") + "\n";
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
