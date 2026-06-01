import { normalizeError } from "../core/errors.js";
import { downloadLog, setupAutoScroll } from "./log-panel-helpers.js";

let elements, logger, connection;
let uartOpen = false;
let uartLogText = "";
let autoScrollFn = null;

function uartLog(text) {
  uartLogText += text;
  elements.uartLogEl.textContent += text;
  if (autoScrollFn) autoScrollFn();
}

export function init(els, log, conn) {
  elements = els;
  logger = log;
  connection = conn;
  autoScrollFn = setupAutoScroll(elements.uartLogEl, elements.chkUartAutoScroll);
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
    elements.btnUartDownload.disabled = false;
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
  elements.btnUartDownload.disabled = true;
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

export function runUartClear() {
  uartLogText = "";
  elements.uartLogEl.textContent = "";
}

export function runUartDownload() {
  downloadLog(uartLogText, `uart-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
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
  elements.btnUartDownload.disabled = true;
  elements.uartTxInput.disabled = true;
  elements.btnUartSend.disabled = true;
  elements.uartStatusEl.textContent = "";
  elements.uartLogEl.textContent = "";
  uartLogText = "";
}