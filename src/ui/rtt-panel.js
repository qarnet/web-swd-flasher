import { RttClient } from "../rtt/rtt-client.js";
import { normalizeError } from "../core/errors.js";
import { AnsiRenderer } from "./ansi-renderer.js";

let elements, logger, connection;
let rttClient = null;
let ansiRenderer = null;

function parseHexInput(s) {
  const t = s.trim();
  if (t.startsWith("0x") || t.startsWith("0X")) return parseInt(t, 16);
  return parseInt(t, 10);
}

function rttLog(msg) {
  ansiRenderer.write(elements.rttLogEl, msg);
  elements.rttLogEl.scrollTop = elements.rttLogEl.scrollHeight;
}

export function init(els, log, conn) {
  elements = els;
  logger = log;
  connection = conn;
}

export async function runRttSearch() {
  if (rttClient) { rttClient.stop(); rttClient = null; }
  const backend = connection.getBackend();
  const ramStart = parseHexInput(elements.rttRamStartInput.value);
  const ramSizeKb = parseInt(elements.rttRamSizeInput.value, 10);
  if (isNaN(ramStart) || isNaN(ramSizeKb) || ramSizeKb <= 0) {
    elements.rttStatusEl.textContent = "Invalid RAM range";
    return;
  }
  const ramSize = ramSizeKb * 1024;
  elements.rttStatusEl.textContent = `Searching 0x${ramStart.toString(16)} + ${ramSizeKb}KB…`;
  elements.btnRttSearch.disabled = true;
  elements.btnRttStart.disabled = true;

  rttClient = new RttClient(backend.adi);
  ansiRenderer = new AnsiRenderer();
  try {
    const found = await rttClient.search(ramStart, ramSize);
    if (found) {
      elements.rttStatusEl.textContent = `Control block at 0x${rttClient.controlBlockAddr.toString(16)} — ${rttClient._upChannels.length} up, ${rttClient._downChannels.length} down channel(s)`;
      elements.btnRttStart.disabled = false;
      if (rttClient._downChannels.length > 0) {
        elements.rttTxInput.disabled = false;
        elements.btnRttSend.disabled = false;
      }
    } else {
      elements.rttStatusEl.textContent = "RTT control block not found in RAM range";
      rttClient = null;
    }
  } catch (error) {
    elements.rttStatusEl.textContent = `Search failed: ${normalizeError(error).message}`;
    rttClient = null;
  }
  elements.btnRttSearch.disabled = !connection.isConnected();
}

export function runRttStart() {
  if (!rttClient) return;
  const intervalMs = parseInt(elements.rttIntervalInput.value, 10) || 50;
  rttClient.removeAllListeners()
    .on("data", ({ channel, data }) => {
      const text = new TextDecoder().decode(data);
      rttLog(text);
    })
    .on("error", (err) => {
      elements.rttStatusEl.textContent = `Poll error: ${err.message}`;
    });
  rttClient.startPolling(intervalMs);
  elements.rttStatusEl.textContent = `Polling channel(s) every ${intervalMs}ms…`;
  elements.btnRttStart.disabled = true;
  elements.btnRttStop.disabled = false;
}

export function runRttStop() {
  if (!rttClient) return;
  rttClient.stop();
  elements.rttStatusEl.textContent = "Stopped";
  elements.btnRttStart.disabled = false;
  elements.btnRttStop.disabled = true;
}

export async function runRttSend() {
  if (!rttClient) return;
  const text = elements.rttTxInput.value;
  if (!text) return;
  try {
    const bytes = new TextEncoder().encode(text + "\n");
    await rttClient.write(0, bytes);
    elements.rttTxInput.value = "";
  } catch (error) {
    elements.rttStatusEl.textContent = `Send failed: ${normalizeError(error).message}`;
  }
}

export function onConnect(backend) {
  elements.btnRttSearch.disabled = false;
}

export function onDisconnect() {
  if (rttClient) { rttClient.stop(); rttClient = null; }
  elements.btnRttSearch.disabled = true;
  elements.btnRttStart.disabled = true;
  elements.btnRttStop.disabled = true;
  elements.rttTxInput.disabled = true;
  elements.btnRttSend.disabled = true;
  elements.rttStatusEl.textContent = "";
  elements.rttLogEl.textContent = "";
}
