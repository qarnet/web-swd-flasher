let statusEl, logEl, statusLed, topbarTarget;

export function init(elements) {
  statusEl = elements.statusEl;
  logEl = elements.logEl;
  statusLed = elements.statusLed;
  topbarTarget = elements.topbarTarget;
}

export function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
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
