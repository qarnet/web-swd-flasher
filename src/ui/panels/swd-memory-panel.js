import { Topics } from "../../core/event-bus-topics.js";
import { normalizeError } from "../../core/errors.js";
import { persistInput } from "../components/persist-input.js";
import { BasePanel } from "./base-panel.js";
import { buildIntelHex } from "../../hex/intel-hex-encoder.js";

export class SwdMemoryPanel extends BasePanel {
  constructor({ bus, readRegions, backendProvider, logger }) {
    super();
    this._bus = bus;
    this._readRegions = readRegions;
    this._backendProvider = backendProvider;
    this._logger = logger;
    this._els = null;
    this._lastReadData = null;
  }

  get lastReadData() { return this._lastReadData; }

  mount(rootEl) {
    this._els = {
      addrInput: rootEl.querySelector("#mem-addr-input"),
      lenInput: rootEl.querySelector("#mem-len-input"),
      btnRead: rootEl.querySelector("#btn-mem-read"),
      btnReadFlash: rootEl.querySelector("#btn-mem-read-flash"),
      btnExport: rootEl.querySelector("#btn-mem-export"),
      btnExportHex: rootEl.querySelector("#btn-mem-export-hex"),
      status: rootEl.querySelector("#mem-status"),
      dump: rootEl.querySelector("#mem-dump"),
    };
    if (!this._els.btnRead || !this._els.btnReadFlash || !this._els.status || !this._els.dump) {
      throw new Error("SwdMemoryPanel: missing required DOM nodes under root");
    }

    this._bindDomListener(this._els.btnRead, "click", this._onRead);
    this._bindDomListener(this._els.btnReadFlash, "click", this._onReadAllFlash);
    this._bindDomListener(this._els.btnExport, "click", this._exportBin);
    this._bindDomListener(this._els.btnExportHex, "click", this._exportHex);
    persistInput(this._els.addrInput, "mem-addr");
    persistInput(this._els.lenInput, "mem-len");

    this._bindBusListener(this._bus, Topics.BACKEND_CONNECTED, () => this._setEnabled(true));
    this._bindBusListener(this._bus, Topics.BACKEND_DISCONNECTED, () => {
      this._setEnabled(false);
      this._els.status.textContent = "";
      this._els.dump.textContent = "";
      this._els.dump.hidden = true;
      this._readRegions.clear();
    });

    this._setEnabled(false);
  }

  unmount() {
    if (!this._els) return;
    this._teardown();
    this._els = null;
  }

  _setEnabled(on) {
    this._els.btnRead.disabled = !on;
    this._els.btnReadFlash.disabled = !on;
  }

  _parseHexInput(s) {
    const t = s.trim();
    if (t.startsWith("0x") || t.startsWith("0X")) return parseInt(t, 16);
    return parseInt(t, 10);
  }

  _formatHexDump(startAddr, bytes) {
    const lines = [];
    for (let i = 0; i < bytes.length; i += 16) {
      const chunk = bytes.slice(i, i + 16);
      const addrStr = (startAddr + i).toString(16).padStart(8, "0");
      const hexParts = [], asciiParts = [];
      for (let j = 0; j < 16; j++) {
        if (j < chunk.length) {
          hexParts.push(chunk[j].toString(16).padStart(2, "0"));
          const c = chunk[j];
          asciiParts.push(c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ".");
        } else { hexParts.push("  "); asciiParts.push(" "); }
      }
      lines.push(`${addrStr}: ${hexParts.slice(0, 8).join(" ")}  ${hexParts.slice(8).join(" ")}  ${asciiParts.join("")}`);
    }
    return lines.join("\n");
  }

  _onRead = async () => {
    const addr = this._parseHexInput(this._els.addrInput.value);
    const lenBytes = this._parseHexInput(this._els.lenInput.value);
    if (isNaN(addr) || isNaN(lenBytes) || lenBytes <= 0) {
      this._els.status.textContent = "Invalid address or length"; return;
    }
    const wordCount = Math.ceil(lenBytes / 4);
    this._els.status.textContent = "Reading...";
    this._els.dump.textContent = "";
    this._els.btnExport.disabled = true;
    this._els.btnExportHex.disabled = true;
    const backend = this._backendProvider();
    if (!backend) return;
    try {
      const mem = backend.getMemoryAccess();
      const words = await mem.readBlockFast(addr, wordCount);
      const bytes = new Uint8Array(words.buffer).slice(0, lenBytes);
      this._lastReadData = { addr, bytes };
      this._els.dump.textContent = this._formatHexDump(addr, bytes);
      this._els.dump.hidden = false;
      this._els.status.textContent = `Read ${bytes.length} bytes at 0x${addr.toString(16)}`;
      this._els.btnExport.disabled = false;
      this._els.btnExportHex.disabled = false;
      this._readRegions.set([{ start: addr, size: bytes.length, ok: true }]);
    } catch (error) {
      this._els.status.textContent = `Read failed: ${normalizeError(error).message}`;
      this._readRegions.set([{ start: addr, size: lenBytes, ok: false }]);
    }
  };

  _onReadAllFlash = async () => {
    const backend = this._backendProvider();
    if (!backend) return;
    const tgt = backend.activeTarget;
    const flashStart = tgt?.flash?.start ?? 0;
    const flashSize = tgt?.flash?.size ?? 1024 * 1024;
    const wordCount = flashSize / 4;
    const mem = backend.getMemoryAccess();
    const chunkWords = mem.maxReadBlockWordCount * 16;

    this._els.status.textContent = "Reading flash...";
    this._els.dump.textContent = "";
    this._els.btnExport.disabled = true;
    this._els.btnExportHex.disabled = true;

    const allWords = new Uint32Array(wordCount);
    let offset = 0;
    const runRead = async () => {
      while (offset < wordCount) {
        const count = Math.min(chunkWords, wordCount - offset);
        const chunk = await mem.readBlockFast(flashStart + offset * 4, count);
        allWords.set(chunk, offset);
        offset += count;
        const percent = Math.round((offset / wordCount) * 100);
        this._els.status.textContent = `Reading flash... ${percent}%`;
        this._bus.emit(Topics.BACKEND_PROGRESS, { percent });
      }
    };

    try {
      if (backend?.withQuietLog) await backend.withQuietLog(runRead);
      else await runRead();

      const bytes = new Uint8Array(allWords.buffer);
      this._lastReadData = { addr: flashStart, bytes };
      this._els.dump.textContent = this._formatHexDump(flashStart, bytes.slice(0, 256));
      this._els.dump.hidden = false;
      this._els.status.textContent = `Read ${bytes.length} bytes of flash (showing first 256B, export for full)`;
      this._els.btnExport.disabled = false;
      this._els.btnExportHex.disabled = false;
      this._readRegions.set([{ start: flashStart, size: flashSize, ok: true }]);
    } catch (error) {
      this._els.status.textContent = `Flash read failed: ${normalizeError(error).message}`;
    }
  };

  _exportBin = () => {
    if (!this._lastReadData) return;
    const { addr, bytes } = this._lastReadData;
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mem_0x${addr.toString(16)}_${bytes.length}B.bin`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  _exportHex = () => {
    if (!this._lastReadData) return;
    const { addr, bytes } = this._lastReadData;
    const hexText = buildIntelHex(addr, bytes);
    const blob = new Blob([hexText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mem_0x${addr.toString(16)}_${bytes.length}B.hex`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
}
