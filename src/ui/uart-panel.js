import { normalizeError } from "../core/errors.js";

let elements, logger, connection;
let uartOpen = false;

function uartLog(text) {
  elements.uartLogEl.textContent += text;
  elements.uartLogEl.scrollTop = elements.uartLogEl.scrollHeight;
}

export function init(els, log, conn) {
  elements = els;
  logger = log;
  connection = conn;
}

export async function openUartSession() {
  const backend = connection.getBackend();
  if (!backend.hasUART) {
    elements.uartStatusEl.textContent = "Probe does not support UART (capability bit 7 not set)";
    return;
  }
  const baudRate = parseInt(elements.uartBaudSelect.value, 10);
  elements.uartStatusEl.textContent = `Opening at ${baudRate} baud…`;
  try {
    await backend.openUart({
      baudRate,
      onData: (bytes) => uartLog(new TextDecoder().decode(bytes)),
      pollIntervalMs: 20
    });
    uartOpen = true;
    elements.btnUartOpen.disabled = true;
    elements.btnUartClose.disabled = false;
    elements.uartTxInput.disabled = false;
    elements.btnUartSend.disabled = false;
    elements.uartStatusEl.textContent = `Open at ${baudRate} baud`;
    logger.log(`UART opened at ${baudRate} baud`);
  } catch (error) {
    elements.uartStatusEl.textContent = `Open failed: ${normalizeError(error).message}`;
    logger.log(`UART open failed: ${normalizeError(error).message}`);
  }
}

export async function closeUartSession() {
  const backend = connection.getBackend();
  try {
    await backend.closeUart();
  } catch { /* ignore */ }
  uartOpen = false;
  elements.btnUartOpen.disabled = !backend.hasUART;
  elements.btnUartClose.disabled = true;
  elements.uartTxInput.disabled = true;
  elements.btnUartSend.disabled = true;
  elements.uartStatusEl.textContent = "Closed";
  logger.log("UART closed");
}

export async function sendUartData() {
  const backend = connection.getBackend();
  const text = elements.uartTxInput.value;
  if (!text || !uartOpen) return;
  try {
    await backend.sendUart(new TextEncoder().encode(text));
    elements.uartTxInput.value = "";
  } catch (error) {
    elements.uartStatusEl.textContent = `Send failed: ${normalizeError(error).message}`;
  }
}

export function onConnect(backend) {
  elements.btnUartOpen.disabled = !backend.hasUART;
}

export function onDisconnect() {
  if (uartOpen) {
    closeUartSession();
  }
  elements.btnUartOpen.disabled = true;
  elements.btnUartClose.disabled = true;
  elements.uartTxInput.disabled = true;
  elements.btnUartSend.disabled = true;
  elements.uartStatusEl.textContent = "";
  elements.uartLogEl.textContent = "";
}
