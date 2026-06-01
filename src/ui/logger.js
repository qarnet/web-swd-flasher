import { downloadLog } from "./log-panel-helpers.js";

let statusEl, logEl, statusLed, topbarTarget;
let verbose = false;
let verboseLogLines = [];

export function init(elements) {
  statusEl = elements.statusEl;
  logEl = elements.logEl;
  statusLed = elements.statusLed;
  topbarTarget = elements.topbarTarget;
}

export function log(message, isVerbose = false) {
  const line = `[${new Date().toISOString()}] ${message}`;
  if (isVerbose) {
    verboseLogLines.push(line);
    if (verbose) {
      logEl.textContent += `${line}\n`;
      logEl.scrollTop = logEl.scrollHeight;
    }
  } else {
    logEl.textContent += `${line}\n`;
    logEl.scrollTop = logEl.scrollHeight;
    if (!verbose) {
      verboseLogLines.push(line);
    }
  }
}

export function setVerbose(v) {
  verbose = !!v;
  if (verbose) {
    const currentLines = verboseLogLines.filter(l => !logEl.textContent.includes(l));
    if (currentLines.length > 0) {
      logEl.textContent += currentLines.map(l => l).join("\n") + "\n";
      logEl.scrollTop = logEl.scrollHeight;
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