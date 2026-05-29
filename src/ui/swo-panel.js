import { normalizeError } from "../core/errors.js";

let elements, logger, connection;
let swoOpen = false;

function swoLog(text) {
  elements.swoLogEl.textContent += text;
  elements.swoLogEl.scrollTop = elements.swoLogEl.scrollHeight;
}

export function init(els, log, conn) {
  elements = els;
  logger = log;
  connection = conn;
}

export async function openSwoSession() {
  const backend = connection.getBackend();
  const baudRate = parseInt(elements.swoBaudInput.value, 10) || 1000000;
  elements.swoStatusEl.textContent = `Opening at ${baudRate} baud…`;
  try {
    const actual = await backend.openSwo({
      baudRate,
      onData: (bytes) => swoLog(new TextDecoder().decode(bytes)),
      pollIntervalMs: 50
    });
    swoOpen = true;
    elements.btnSwoOpen.disabled = true;
    elements.btnSwoClose.disabled = false;
    elements.swoStatusEl.textContent = `Open at ${actual} baud (requested ${baudRate})`;
    logger.log(`SWO opened at ${actual} baud`);
  } catch (e) {
    elements.swoStatusEl.textContent = `Open failed: ${normalizeError(e).message}`;
  }
}

export async function closeSwoSession() {
  const backend = connection.getBackend();
  try { await backend.closeSwo(); } catch { /* ignore */ }
  swoOpen = false;
  elements.btnSwoOpen.disabled = !backend.hasSWO;
  elements.btnSwoClose.disabled = true;
  elements.swoStatusEl.textContent = "Closed";
  logger.log("SWO closed");
}

export function onConnect(backend) {
  const hasSWO = backend.hasSWO;
  elements.swoPanelEl.hidden = !hasSWO;
  elements.btnSwoOpen.disabled = !hasSWO;
}

export function onDisconnect() {
  if (swoOpen) {
    closeSwoSession();
  }
  elements.swoPanelEl.hidden = true;
  elements.btnSwoOpen.disabled = true;
  elements.btnSwoClose.disabled = true;
  elements.swoStatusEl.textContent = "";
  elements.swoLogEl.textContent = "";
}
