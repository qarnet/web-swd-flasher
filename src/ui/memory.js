import { normalizeError } from "../core/errors.js";

let elements, logger, connection;
let lastReadData = null;
let onRefreshVisualizerCallback;

export function init(els, log, conn) {
  elements = els;
  logger = log;
  connection = conn;
}

export function setRefreshVisualizerCallback(fn) {
  onRefreshVisualizerCallback = fn;
}

export function getReadRegions() {
  return window.readRegions || [];
}

function parseHexInput(s) {
  const t = s.trim();
  if (t.startsWith("0x") || t.startsWith("0X")) return parseInt(t, 16);
  return parseInt(t, 10);
}

function formatHexDump(startAddr, bytes) {
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    const addrStr = (startAddr + i).toString(16).padStart(8, "0");
    const hexParts = [];
    const asciiParts = [];
    for (let j = 0; j < 16; j++) {
      if (j < chunk.length) {
        hexParts.push(chunk[j].toString(16).padStart(2, "0"));
        const c = chunk[j];
        asciiParts.push(c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ".");
      } else {
        hexParts.push("  ");
        asciiParts.push(" ");
      }
    }
    lines.push(`${addrStr}: ${hexParts.slice(0, 8).join(" ")}  ${hexParts.slice(8).join(" ")}  ${asciiParts.join("")}`);
  }
  return lines.join("\n");
}

export async function runReadMemory() {
  const addr = parseHexInput(elements.memAddrInput.value);
  const lenBytes = parseHexInput(elements.memLenInput.value);
  if (isNaN(addr) || isNaN(lenBytes) || lenBytes <= 0) {
    elements.memStatusEl.textContent = "Invalid address or length";
    return;
  }
  const wordCount = Math.ceil(lenBytes / 4);
  elements.memStatusEl.textContent = "Reading...";
  elements.memDumpEl.textContent = "";
  elements.btnMemExport.disabled = true;
  elements.btnMemExportHex.disabled = true;
  const backend = connection.getBackend();
  try {
    const words = await backend.adi.readMemBlockFast(addr, wordCount);
    const bytes = new Uint8Array(words.buffer).slice(0, lenBytes);
    lastReadData = { addr, bytes };
    elements.memDumpEl.textContent = formatHexDump(addr, bytes);
    elements.memDumpEl.hidden = false;
    elements.memStatusEl.textContent = `Read ${bytes.length} bytes at 0x${addr.toString(16)}`;
    elements.btnMemExport.disabled = false;
    elements.btnMemExportHex.disabled = false;
    window.readRegions = [{ start: addr, size: bytes.length, ok: true }];
    if (onRefreshVisualizerCallback) onRefreshVisualizerCallback();
  } catch (error) {
    const normalized = normalizeError(error);
    elements.memStatusEl.textContent = `Read failed: ${normalized.message}`;
    window.readRegions = [{ start: addr, size: lenBytes, ok: false }];
    if (onRefreshVisualizerCallback) onRefreshVisualizerCallback();
  }
}

export async function runReadAllFlash() {
  if (!connection.isConnected()) return;
  const backend = connection.getBackend();
  const tgt = backend.activeTarget;
  const flashStart = tgt?.flash?.start ?? 0;
  const flashSize = tgt?.flash?.size ?? 1024 * 1024;
  const wordCount = flashSize / 4;
  const chunkWords = backend.adi.maxReadBlockWordCount * 16;

  elements.memStatusEl.textContent = "Reading flash...";
  elements.memDumpEl.textContent = "";
  elements.btnMemExport.disabled = true;
  elements.btnMemExportHex.disabled = true;

  const allWords = new Uint32Array(wordCount);
  let offset = 0;
  const transport = backend.core.transport;
  const origLog = transport.log;
  transport.log = null;
  try {
    while (offset < wordCount) {
      const count = Math.min(chunkWords, wordCount - offset);
      const chunk = await backend.adi.readMemBlockFast(flashStart + offset * 4, count);
      allWords.set(chunk, offset);
      offset += count;
      const percent = Math.round((offset / wordCount) * 100);
      elements.memStatusEl.textContent = `Reading flash... ${percent}%`;
    }
    const bytes = new Uint8Array(allWords.buffer);
    lastReadData = { addr: flashStart, bytes };
    elements.memDumpEl.textContent = formatHexDump(flashStart, bytes.slice(0, 256));
    elements.memDumpEl.hidden = false;
    elements.memStatusEl.textContent = `Read ${bytes.length} bytes of flash (showing first 256B, export for full)`;
    elements.btnMemExport.disabled = false;
    elements.btnMemExportHex.disabled = false;
    window.readRegions = [{ start: flashStart, size: flashSize, ok: true }];
    if (onRefreshVisualizerCallback) onRefreshVisualizerCallback();
  } catch (error) {
    const normalized = normalizeError(error);
    elements.memStatusEl.textContent = `Flash read failed: ${normalized.message}`;
  } finally {
    transport.log = origLog;
  }
}

function buildIntelHex(addr, bytes) {
  const lines = [];
  const hexByte = (v) => v.toString(16).padStart(2, "0").toUpperCase();
  const record = (type, address, data) => {
    const len = data.length;
    let sum = len + type + ((address >> 8) & 0xff) + (address & 0xff);
    for (const b of data) sum += b;
    const checksum = ((~sum + 1) & 0xff);
    const payload = data.map(hexByte).join("");
    return `:${hexByte(len)}${address.toString(16).padStart(4,"0").toUpperCase()}${hexByte(type)}${payload}${hexByte(checksum)}`;
  };

  let currentSegBase = -1;
  let offset = 0;
  while (offset < bytes.length) {
    const absAddr = addr + offset;
    const segBase = absAddr >>> 16;
    if (segBase !== currentSegBase) {
      currentSegBase = segBase;
      const extData = [(segBase >> 8) & 0xff, segBase & 0xff];
      lines.push(record(4, 0, extData));
    }
    const chunkSize = Math.min(16, bytes.length - offset);
    const chunk = Array.from(bytes.slice(offset, offset + chunkSize));
    const lineAddr = absAddr & 0xffff;
    lines.push(record(0, lineAddr, chunk));
    offset += chunkSize;
  }
  lines.push(":00000001FF");
  return lines.join("\r\n") + "\r\n";
}

export function exportMemoryBin() {
  if (!lastReadData) return;
  const blob = new Blob([lastReadData.bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mem_0x${lastReadData.addr.toString(16)}_${lastReadData.bytes.length}B.bin`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportMemoryHex() {
  if (!lastReadData) return;
  const hexText = buildIntelHex(lastReadData.addr, lastReadData.bytes);
  const blob = new Blob([hexText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mem_0x${lastReadData.addr.toString(16)}_${lastReadData.bytes.length}B.hex`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function onConnect(backend) {
  elements.btnMemRead.disabled = false;
  elements.btnMemReadFlash.disabled = false;
}

export function onDisconnect() {
  elements.btnMemRead.disabled = true;
  elements.btnMemReadFlash.disabled = true;
  elements.memStatusEl.textContent = "";
  elements.memDumpEl.textContent = "";
  elements.memDumpEl.hidden = true;
  window.readRegions = [];
  if (onRefreshVisualizerCallback) onRefreshVisualizerCallback();
}
