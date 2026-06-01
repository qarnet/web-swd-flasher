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

export function log(message, isVerbose = false) {
  const line = `[${new Date().toISOString()}] ${message}`;
  verboseLogLines.push(line);
  if (isVerbose && !verbose) return;
  logEl.textContent += `${line}\n`;
}

export function setVerbose(v) {
  verbose = !!v;
  if (verbose) {
    const visible = logEl.textContent;
    const missing = verboseLogLines.filter(l => !visible.includes(l));
    if (missing.length > 0) {
      logEl.textContent += missing.join("\n") + "\n";
    }
  }
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