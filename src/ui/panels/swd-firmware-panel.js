import { mergeHexFiles, FILE_COLORS } from "../../hex/multi-hex-merger.js";
import { parseIntelHexFileText } from "../../hex/intel-hex-parser.js";
import { buildImageMap, formatImageMap } from "../../hex/image-map.js";
import { validateAppRange } from "../../nrf/nrf52-memory-map.js";
import { Topics } from "../../core/event-bus-topics.js";
import { normalizeError } from "../../core/errors.js";
import { BasePanel } from "./base-panel.js";
import { escHtml } from "../components/escape-html.js";

export class SwdFirmwarePanel extends BasePanel {
  constructor({ bus, readRegions, backendProvider, logger }) {
    super();
    this._bus = bus;
    this._readRegions = readRegions;
    this._backendProvider = backendProvider;
    this._logger = logger;
    this._els = null;
    this._hexFiles = [];
    this._nextFileId = 0;
    this._imageContext = null;
  }

  get imageContext() { return this._imageContext; }
  get hexFiles() { return this._hexFiles; }

  mount(rootEl) {
    this._els = {
      fileInput: rootEl.querySelector("#file-input"),
      urlInput: rootEl.querySelector("#url-input"),
      builtinSelect: rootEl.querySelector("#builtin-select"),
      btnFetchHex: rootEl.querySelector("#btn-fetch-hex"),
      btnLoadBuiltin: rootEl.querySelector("#btn-load-builtin"),
      btnClearHex: rootEl.querySelector("#btn-clear-hex"),
      fileListEl: rootEl.querySelector("#file-list"),
      imageSummary: rootEl.querySelector("#image-summary"),
      imageMapEl: rootEl.querySelector("#image-map"),
      flashModeSelect: rootEl.querySelector("#flash-mode-select"),
      btnProgram: rootEl.querySelector("#btn-program"),
      btnVerify: rootEl.querySelector("#btn-verify"),
      btnReset: rootEl.querySelector("#btn-reset"),
      btnProgramVerifyReset: rootEl.querySelector("#btn-program-verify-reset"),
      chkConfirmProgram: rootEl.querySelector("#chk-confirm-program"),
    };
    if (!this._els.fileInput || !this._els.btnProgram || !this._els.btnProgramVerifyReset) {
      throw new Error("SwdFirmwarePanel: missing required DOM nodes under root");
    }

    this._bindDomListener(this._els.btnFetchHex, "click", this._onFetchHex);
    this._bindDomListener(this._els.btnLoadBuiltin, "click", this._onLoadBuiltin);
    this._bindDomListener(this._els.fileInput, "change", this._onFirmwareSelected);
    this._bindDomListener(this._els.btnClearHex, "click", this._onClearHex);
    this._bindDomListener(this._els.btnProgram, "click", this._onProgram);
    this._bindDomListener(this._els.btnVerify, "click", this._onVerify);
    this._bindDomListener(this._els.btnReset, "click", this._onReset);
    this._bindDomListener(this._els.btnProgramVerifyReset, "click", this._onProgramVerifyReset);
    this._bindDomListener(this._els.chkConfirmProgram, "change", this._onConfirmChange);

    this._bindBusListener(this._bus, Topics.BACKEND_CONNECTED, () => { this._mergeAndUpdate(); this._updateButtons(); });
    this._bindBusListener(this._bus, Topics.BACKEND_DISCONNECTED, () => {
      this._mergeAndUpdate();
      this._els.btnProgram.disabled = true;
      this._els.btnVerify.disabled = true;
      this._els.btnReset.disabled = true;
      this._els.btnProgramVerifyReset.disabled = true;
    });

    this._updateButtons();
    this._mergeAndUpdate();
  }

  unmount() {
    if (!this._els) return;
    this._teardown();
    this._els = null;
  }

  _getActiveTarget() {
    const backend = this._backendProvider();
    return backend ? backend.activeTarget : null;
  }

  _updateButtons() {
    const imageReady = this._imageContext?.policy?.ok === true;
    const confirmed = this._els.chkConfirmProgram.checked;
    const backend = this._backendProvider();
    const connected = !!backend;
    const caps = connected ? backend.capabilities() : { supportsFlash: false, supportsVerify: false, supportsReset: false };

    this._els.btnProgram.disabled = !(connected && imageReady && confirmed && caps.supportsFlash);
    this._els.btnVerify.disabled = !(connected && imageReady && confirmed && caps.supportsVerify);
    this._els.btnReset.disabled = !(connected && caps.supportsReset);
    this._els.btnProgramVerifyReset.disabled = !(connected && imageReady && confirmed && caps.supportsFlash && caps.supportsVerify && caps.supportsReset);
  }

  _onConfirmChange = () => {
    this._updateButtons();
  };

  _mergeAndUpdate() {
    if (this._hexFiles.length === 0) {
      this._imageContext = null;
      this._els.imageSummary.textContent = "No image loaded";
      this._els.imageMapEl.textContent = "";
      this._els.imageMapEl.hidden = true;
      this._bus.emit(Topics.IMAGE_CHANGED, { context: null, hexFiles: this._hexFiles });
      return;
    }

    const mode = this._els.flashModeSelect.value;
    const { conflicts, merged } = mergeHexFiles(this._hexFiles);

    if (conflicts.length > 0) {
      for (const c of conflicts) {
        this._logger.log(`Conflict at 0x${c.addr.toString(16)}: ${c.fileA}=0x${c.valueA.toString(16)} vs ${c.fileB}=0x${c.valueB.toString(16)}`);
      }
      this._els.imageSummary.textContent = `${conflicts.length} address conflict(s) between loaded files.`;
      this._imageContext = null;
      this._els.imageMapEl.textContent = "";
      this._els.imageMapEl.hidden = true;
      this._bus.emit(Topics.IMAGE_CHANGED, { context: null, hexFiles: this._hexFiles });
      return;
    }

    if (!merged) {
      this._imageContext = null;
      this._els.imageSummary.textContent = "No data after merge";
      this._els.imageMapEl.hidden = true;
      this._bus.emit(Topics.IMAGE_CHANGED, { context: null, hexFiles: this._hexFiles });
      return;
    }

    const map = buildImageMap(merged);
    const policy = validateAppRange(map, mode, this._getActiveTarget());
    this._imageContext = { parsed: merged, map, policy, mode };
    this._els.imageMapEl.textContent = formatImageMap(map);
    this._els.imageMapEl.hidden = false;

    if (policy.ok) {
      const names = this._hexFiles.map((f) => f.name).join(", ");
      this._els.imageSummary.textContent = `${merged.byteCount} bytes from ${this._hexFiles.length} file(s) — OK (mode: ${mode})`;
      this._logger.log(`Image accepted: ${names} (mode: ${mode})`);
    } else {
      this._els.imageSummary.textContent = "Image rejected by range policy.";
      for (const issue of policy.violations) {
        this._logger.log(`Policy violation: ${issue}`);
      }
    }
    this._bus.emit(Topics.IMAGE_CHANGED, { context: this._imageContext, hexFiles: this._hexFiles });
  }

  _addHexFromText(name, text) {
    try {
      const parsed = parseIntelHexFileText(text);
      const color = FILE_COLORS[this._nextFileId % FILE_COLORS.length];
      this._hexFiles.push({ id: this._nextFileId++, name, parsed, color });
      this._renderFileList();
      this._mergeAndUpdate();
    } catch (error) {
      this._logger.log(`Parse failed (${name}): ${error.message}`);
    }
  }

  _renderFileList() {
    if (this._hexFiles.length === 0) {
      this._els.fileListEl.innerHTML = "";
      return;
    }
    const items = this._hexFiles.map((f) => {
      const segs = buildImageMap(f.parsed).segments.length;
      return `<div class="file-item flex-center gap-sm my-1">
        <span class="w-3 h-3 rounded-sm flex-shrink-0" style="background:${f.color};"></span>
        <span class="flex-1 text-sm">${escHtml(f.name)} <small class="text-muted">(${f.parsed.byteCount}B, ${segs} seg)</small></span>
        <button type="button" data-remove-id="${f.id}" class="text-xs px-1 py-1">&cross;</button>
      </div>`;
    }).join("");
    this._els.fileListEl.innerHTML = items;
    this._els.fileListEl.querySelectorAll("[data-remove-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.dataset.removeId, 10);
        this._hexFiles = this._hexFiles.filter((f) => f.id !== id);
        this._renderFileList();
        this._mergeAndUpdate();
      });
    });
  }

  _onFetchHex = async () => {
    const url = this._els.urlInput.value.trim();
    if (!url) return;
    this._logger.setStatus("Fetching hex...");
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const name = url.split("/").pop() || url;
      this._addHexFromText(name, text);
      this._logger.setStatus("Ready");
    } catch (error) {
      this._logger.log(`Fetch failed: ${error.message}`);
      this._logger.setStatus("Ready");
    }
  };

  _onLoadBuiltin = async () => {
    const url = this._els.builtinSelect.value;
    if (!url) {
      this._logger.setStatus("Select a firmware variant first");
      return;
    }
    const name = this._els.builtinSelect.options[this._els.builtinSelect.selectedIndex].textContent;
    this._logger.setStatus(`Loading ${name}...`);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      this._addHexFromText(`${name}.hex`, text);
      this._logger.setStatus("Ready");
    } catch (error) {
      this._logger.log(`Built-in load failed: ${error.message}`);
      this._logger.setStatus("Ready");
    }
  };

  _onFirmwareSelected = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    for (const file of files) {
      try {
        const text = await file.text();
        this._addHexFromText(file.name, text);
      } catch (error) {
        this._logger.log(`File read failed (${file.name}): ${error.message}`);
      }
    }
    event.target.value = "";
  };

  _onClearHex = () => {
    this._hexFiles = [];
    this._renderFileList();
    this._mergeAndUpdate();
  };

  _onProgram = async () => {
    if (!this._imageContext?.policy?.ok) {
      this._logger.setStatus("Program blocked: image is missing or failed policy checks");
      return;
    }
    const backend = this._backendProvider();
    if (!backend) return;
    try {
      this._logger.setStatus("Programming image...");
      await backend.programImage(this._imageContext.parsed, { mode: this._imageContext.mode });
      this._logger.setStatus("Program complete");
    } catch (error) {
      const normalized = normalizeError(error);
      this._logger.setStatus(`Program failed (${normalized.code}): ${normalized.message}`);
    }
  };

  _onVerify = async () => {
    if (!this._imageContext?.policy?.ok) {
      this._logger.setStatus("Verify blocked: image is missing or failed policy checks");
      return;
    }
    const backend = this._backendProvider();
    if (!backend) return;
    try {
      this._logger.setStatus("Verifying image...");
      await backend.verifyImage(this._imageContext.parsed, { mode: this._imageContext.mode });
      this._logger.setStatus("Verify complete");
      if (this._imageContext.map) {
        this._readRegions.set(this._imageContext.map.segments.map((s) => ({ start: s.start, size: s.length, ok: true })));
      }
    } catch (error) {
      const normalized = normalizeError(error);
      this._logger.setStatus(`Verify failed (${normalized.code}): ${normalized.message}`);
    }
  };

  _onReset = async () => {
    const backend = this._backendProvider();
    if (!backend) return;
    try {
      this._logger.setStatus("Resetting target...");
      await backend.reset("run");
      this._logger.setStatus("Reset complete");
    } catch (error) {
      const normalized = normalizeError(error);
      this._logger.setStatus(`Reset failed (${normalized.code}): ${normalized.message}`);
    }
  };

  _onProgramVerifyReset = async () => {
    if (!this._imageContext?.policy?.ok) {
      this._logger.setStatus("Program blocked: image is missing or failed policy checks");
      return;
    }
    const backend = this._backendProvider();
    if (!backend) return;
    try {
      this._logger.setStatus("Programming image...");
      await backend.programImage(this._imageContext.parsed, { mode: this._imageContext.mode });
      this._logger.setStatus("Verifying image...");
      await backend.verifyImage(this._imageContext.parsed, { mode: this._imageContext.mode });
      if (this._imageContext.map) {
        this._readRegions.set(this._imageContext.map.segments.map((s) => ({ start: s.start, size: s.length, ok: true })));
      }
      this._logger.setStatus("Resetting target...");
      await backend.reset("run");
      this._logger.setStatus("Program -> Verify -> Reset complete");
    } catch (error) {
      const normalized = normalizeError(error);
      this._logger.setStatus(`Operation failed (${normalized.code}): ${normalized.message}`);
    }
  };
}
