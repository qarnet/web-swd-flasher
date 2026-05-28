import { BackendManager } from "./core/backend-manager.js";
import { normalizeError } from "./core/errors.js";
import { ProgressBus } from "./core/progress.js";
import { parseIntelHexFileText } from "./hex/intel-hex-parser.js";
import { buildImageMap, formatImageMap } from "./hex/image-map.js";
import { FILE_COLORS, mergeHexFiles } from "./hex/multi-hex-merger.js";
import { validateAppRange } from "./nrf/nrf52-memory-map.js";
import { formatFicrInfo } from "./nrf/nrf52-ficr.js";
import { renderFlashVisualizer } from "./ui/flash-visualizer.js";
import { RttClient } from "./rtt/rtt-client.js";

// --- DOM refs ---
const compatBanner = document.getElementById("compat-banner");
const compatMsg = document.getElementById("compat-msg");
const btnConnect = document.getElementById("btn-connect");
const btnDisconnect = document.getElementById("btn-disconnect");
const btnProgram = document.getElementById("btn-program");
const btnVerify = document.getElementById("btn-verify");
const btnReset = document.getElementById("btn-reset");
const backendSelect = document.getElementById("backend-select");
const chkConfirmProgram = document.getElementById("chk-confirm-program");
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const targetInfoEl = document.getElementById("target-info");
const fileInput = document.getElementById("file-input");
const imageSummary = document.getElementById("image-summary");
const imageMapEl = document.getElementById("image-map");
const btnFetchHex = document.getElementById("btn-fetch-hex");
const btnLoadBuiltin = document.getElementById("btn-load-builtin");
const btnClearHex = document.getElementById("btn-clear-hex");
const clockSelect = document.getElementById("clock-select");
const probeCapsEl = document.getElementById("probe-caps");
const btnCheckProtection = document.getElementById("btn-check-protection");
const btnRecover = document.getElementById("btn-recover");
const recoveryStatusEl = document.getElementById("recovery-status");
const targetSelect = document.getElementById("target-select");
const fileListEl = document.getElementById("file-list");
const flashVisualizerEl = document.getElementById("flash-visualizer");
const btnRttSearch = document.getElementById("btn-rtt-search");
const btnRttStart = document.getElementById("btn-rtt-start");
const btnRttStop = document.getElementById("btn-rtt-stop");
const btnRttClear = document.getElementById("btn-rtt-clear");
const rttStatusEl = document.getElementById("rtt-status");
const rttLogEl = document.getElementById("rtt-log");
const rttTxInput = document.getElementById("rtt-tx-input");
const btnRttSend = document.getElementById("btn-rtt-send");
const rttRamStartInput = document.getElementById("rtt-ram-start");
const rttRamSizeInput = document.getElementById("rtt-ram-size");
const rttIntervalInput = document.getElementById("rtt-interval");
const statusLed = document.getElementById("status-led");
const topbarTarget = document.getElementById("topbar-target");
const btnTheme = document.getElementById("btn-theme");
const progressBar = document.getElementById("progress-bar");
const progressFill = document.getElementById("progress-fill");

const memAddrInput = document.getElementById("mem-addr-input");
const memLenInput = document.getElementById("mem-len-input");
const btnMemRead = document.getElementById("btn-mem-read");
const btnMemReadFlash = document.getElementById("btn-mem-read-flash");
const btnMemExport = document.getElementById("btn-mem-export");
const memStatusEl = document.getElementById("mem-status");
const memDumpEl = document.getElementById("mem-dump");

// --- Theme ---
(function initTheme() {
  const saved = localStorage.getItem("theme") || "light";
  if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
  btnTheme?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  });
})();

// --- App state ---
const progressBus = new ProgressBus();
const backendManager = new BackendManager(progressBus, (message) => log(message));
const backendParam = new URLSearchParams(window.location.search).get("backend");
const storedBackendName = window.localStorage.getItem("backend-name");
const selectedBackendName = backendParam || storedBackendName || "cmsis-dap";
backendSelect.value = selectedBackendName;
let backend = backendManager.getBackend(selectedBackendName);
let hexFiles = [];  // [{id, name, parsed, color}]
let nextFileId = 0;
let imageContext = null;
let connected = false;
let lastReadData = null;  // {addr, bytes: Uint8Array} — for export
let rttClient = null;
let readRegions = [];     // [{start, size, ok}] — for visualizer overlay

// --- Logging ---
function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(message) {
  statusEl.textContent = message;
  log(message);
}

// --- Target info rendering ---
function renderTargetInfo(probe, target) {
  const lines = [];
  lines.push(`Backend: ${probe.backend}`);
  lines.push(`Probe: ${probe.name || "unknown"}`);
  if (probe.manufacturer) lines.push(`Manufacturer: ${probe.manufacturer}`);
  if (probe.transport) lines.push(`Transport: ${probe.transport}`);
  if (probe.packetSize) lines.push(`Packet size: ${probe.packetSize}`);
  lines.push(`Target family: ${target.family || "unknown"}`);
  lines.push(`Target part: ${target.part || "unknown"}`);
  if (target.dpidr) lines.push(`DPIDR: ${target.dpidr}`);
  if (target.flash) {
    const mb = (target.flash.size / 1024 / 1024).toFixed(3);
    lines.push(`Flash: 0x${target.flash.start.toString(16)} + ${mb} MB (page ${target.flash.pageSize / 1024} KB)`);
  }
  if (target.ram) {
    const kb = target.ram.size / 1024;
    lines.push(`RAM: 0x${target.ram.start.toString(16)} + ${kb} KB`);
  }
  if (target.ficr) {
    lines.push(`FICR part: 0x${target.ficr.part.toString(16)}`);
    lines.push(`FICR variant: 0x${target.ficr.variant.toString(16)}`);
    lines.push(`FICR package: 0x${target.ficr.package.toString(16)}`);
    lines.push(`FICR ram: ${target.ficr.ram}`);
    lines.push(`FICR flash: ${target.ficr.flash}`);
  }
  targetInfoEl.textContent = lines.join("\n");

  if (probe.capabilities !== undefined) {
    const caps = [];
    caps.push(`Capabilities: 0x${probe.capabilities.toString(16).padStart(2, "0")}`);
    caps.push(`  SWD: ${probe.hasSWD ? "yes" : "no"}`);
    caps.push(`  JTAG: ${probe.hasJTAG ? "yes" : "no"}`);
    caps.push(`  SWO UART: ${probe.hasSWO_UART ? "yes" : "no"}`);
    caps.push(`  SWO Manchester: ${probe.hasSWO_Manchester ? "yes" : "no"}`);
    caps.push(`  Atomic Commands: ${probe.hasAtomicCommands ? "yes" : "no"}`);
    caps.push(`  Test Domain Timer: ${probe.hasTestDomainTimer ? "yes" : "no"}`);
    caps.push(`  SWO Streaming: ${probe.hasSWO_Streaming ? "yes" : "no"}`);
    caps.push(`  UART Port: ${probe.hasUART ? "yes" : "no"}`);
    caps.push(`Max packet count: ${probe.maxPacketCount}`);
    caps.push(`Max packet size: ${probe.maxPacketSize}`);
    probeCapsEl.textContent = caps.join("\n");
    probeCapsEl.hidden = false;
  }
}

// --- Target selector ---
function populateTargetSelector() {
  const targets = backend.availableTargets ?? [];
  while (targetSelect.options.length > 1) targetSelect.remove(1);
  for (const t of targets) {
    if (t.id === "generic") continue;
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.label;
    targetSelect.appendChild(opt);
  }
}

// --- Connection state ---
function setProgress(percent) {
  if (percent === null) {
    progressBar.hidden = true;
    progressFill.style.width = "0%";
  } else {
    progressBar.hidden = false;
    progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }
}

function setConnected(isConnected) {
  window.connectedState = isConnected;
  statusLed.classList.toggle("on", isConnected);
  topbarTarget.textContent = isConnected ? (backend.activeTarget?.label ?? "Connected") : "Not connected";
  btnConnect.disabled = isConnected;
  btnDisconnect.disabled = !isConnected;
  btnCheckProtection.disabled = !isConnected;
  btnRecover.disabled = !isConnected;
  targetSelect.disabled = !isConnected;
  btnMemRead.disabled = !isConnected;
  btnMemReadFlash.disabled = !isConnected;
  btnRttSearch.disabled = !isConnected;
  if (!isConnected) {
    if (rttClient) { rttClient.stop(); rttClient = null; }
    btnRttStart.disabled = true;
    btnRttStop.disabled = true;
    rttTxInput.disabled = true;
    btnRttSend.disabled = true;
    rttStatusEl.textContent = "";
    probeCapsEl.hidden = true;
    probeCapsEl.textContent = "";
    recoveryStatusEl.textContent = "";
    targetSelect.value = "auto";
    readRegions = [];
  }
  updateOperationButtons();
}

function updateOperationButtons() {
  const imageReady = imageContext?.policy?.ok === true;
  const confirmed = chkConfirmProgram.checked;
  const caps = backend.capabilities();
  btnProgram.disabled = !(connected && imageReady && confirmed && caps.supportsFlash);
  btnVerify.disabled = !(connected && imageReady && confirmed && caps.supportsVerify);
  btnReset.disabled = !(connected && caps.supportsReset);
}

// --- Compatibility check ---
function checkCompatibility() {
  if (!window.isSecureContext) {
    compatMsg.textContent = "Secure context required (use localhost).";
    compatBanner.hidden = false;
    btnConnect.disabled = true;
    return false;
  }
  if (!navigator.usb) {
    compatMsg.textContent = "navigator.usb unavailable in this browser profile.";
    compatBanner.hidden = false;
    btnConnect.disabled = true;
    return false;
  }
  compatBanner.hidden = true;
  return true;
}

// --- Multi-hex file management ---
function activeTargetForValidation() {
  return connected ? backend.activeTarget : null;
}

function mergeAndUpdate() {
  if (hexFiles.length === 0) {
    imageContext = null;
    imageSummary.textContent = "No image loaded";
    imageMapEl.textContent = "";
    updateOperationButtons();
    refreshVisualizer();
    return;
  }

  const mode = document.getElementById("flash-mode-select").value;
  const { conflicts, merged } = mergeHexFiles(hexFiles);

  if (conflicts.length > 0) {
    for (const c of conflicts) {
      log(`Conflict at 0x${c.addr.toString(16)}: ${c.fileA}=0x${c.valueA.toString(16)} vs ${c.fileB}=0x${c.valueB.toString(16)}`);
    }
    imageSummary.textContent = `⚠ ${conflicts.length} address conflict(s) between loaded files.`;
    imageContext = null;
    imageMapEl.textContent = "";
    updateOperationButtons();
    refreshVisualizer();
    return;
  }

  if (!merged) {
    imageContext = null;
    imageSummary.textContent = "No data after merge";
    updateOperationButtons();
    refreshVisualizer();
    return;
  }

  const map = buildImageMap(merged);
  const policy = validateAppRange(map, mode, activeTargetForValidation());
  imageContext = { parsed: merged, map, policy, mode };
  imageMapEl.textContent = formatImageMap(map);

  if (policy.ok) {
    const names = hexFiles.map((f) => f.name).join(", ");
    imageSummary.textContent = `${merged.byteCount} bytes from ${hexFiles.length} file(s) — OK (mode: ${mode})`;
    log(`Image accepted: ${names} (mode: ${mode})`);
  } else {
    imageSummary.textContent = "Image rejected by range policy.";
    for (const issue of policy.violations) {
      log(`Policy violation: ${issue}`);
    }
  }
  updateOperationButtons();
  refreshVisualizer();
}

function addHexFromText(name, text) {
  try {
    const parsed = parseIntelHexFileText(text);
    const color = FILE_COLORS[nextFileId % FILE_COLORS.length];
    hexFiles.push({ id: nextFileId++, name, parsed, color });
    renderFileList();
    mergeAndUpdate();
  } catch (error) {
    log(`Parse failed (${name}): ${error.message}`);
  }
}

function renderFileList() {
  if (hexFiles.length === 0) {
    fileListEl.innerHTML = "";
    return;
  }
  const items = hexFiles.map((f) => {
    const segs = buildImageMap(f.parsed).segments.length;
    return `<div class="file-item" style="display:flex;align-items:center;gap:0.5rem;margin:0.25rem 0;">
      <span style="width:14px;height:14px;border-radius:3px;background:${f.color};flex-shrink:0;"></span>
      <span style="flex:1;font-size:0.85rem;">${escHtml(f.name)} <small style="color:#6b7280;">(${f.parsed.byteCount}B, ${segs} seg)</small></span>
      <button type="button" data-remove-id="${f.id}" style="padding:0.2rem 0.5rem;font-size:0.75rem;">✕</button>
    </div>`;
  }).join("");
  fileListEl.innerHTML = items;
  fileListEl.querySelectorAll("[data-remove-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.removeId, 10);
      hexFiles = hexFiles.filter((f) => f.id !== id);
      renderFileList();
      mergeAndUpdate();
    });
  });
}

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- Flash visualizer ---
function refreshVisualizer() {
  const tgt = connected ? backend.activeTarget : null;
  const files = hexFiles.map((f) => ({
    name: f.name,
    color: f.color,
    segments: buildImageMap(f.parsed).segments
  }));
  renderFlashVisualizer(flashVisualizerEl, {
    flashStart: tgt?.flash?.start ?? 0,
    flashSize: tgt?.flash?.size ?? 1024 * 1024,
    targetId: tgt?.id ?? null,
    files,
    readRegions
  });
}

// --- Connect / disconnect ---
async function connectProbe() {
  const name = backendSelect.value;
  backend = backendManager.setBackend(name);
  try {
    const known = await backend.getAuthorizedDevices();
    if (known.length > 0) {
      log(`Found ${known.length} previously authorized USB device(s).`);
    }
    setStatus("Selecting probe...");
    await backend.requestDevice();
    await backend.connect();
    const probe = await backend.getProbeInfo();
    const target = await backend.getTargetInfo();
    connected = true;
    populateTargetSelector();
    if (target.id && target.id !== "generic") {
      targetSelect.value = target.id;
    }
    setConnected(true);
    const detectNote = target.autoDetected ? "(auto-detected)" : "(manual)";
    setStatus(`Connected: ${probe.name} via ${probe.transport}; target ${target.part} ${detectNote}`);
    renderTargetInfo(probe, target);
    if (target.ficr) {
      log(`FICR: ${formatFicrInfo(target.ficr)}`);
    }
    refreshVisualizer();
  } catch (error) {
    const normalized = normalizeError(error);
    setStatus(`Connect failed (${normalized.code}): ${normalized.message}`);
  }
}

async function disconnectProbe() {
  try {
    await backend.disconnect();
  } catch (error) {
    log(`Close warning: ${error.message}`);
  }
  connected = false;
  setConnected(false);
  setStatus("Disconnected");
  targetInfoEl.textContent = "";
  refreshVisualizer();
}

// --- Hex loading ---
async function onFetchHex() {
  const url = document.getElementById("url-input").value.trim();
  if (!url) return;
  setStatus("Fetching hex…");
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const name = url.split("/").pop() || url;
    addHexFromText(name, text);
    setStatus("Ready");
  } catch (error) {
    log(`Fetch failed: ${error.message}`);
    setStatus("Ready");
  }
}

async function onLoadBuiltin() {
  setStatus("Loading built-in firmware…");
  try {
    const response = await fetch("test-blinky.hex");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    addHexFromText("blinky.hex", text);
    setStatus("Ready");
  } catch (error) {
    log(`Built-in load failed: ${error.message}`);
    setStatus("Ready");
  }
}

async function onFirmwareSelected(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  for (const file of files) {
    try {
      const text = await file.text();
      addHexFromText(file.name, text);
    } catch (error) {
      log(`File read failed (${file.name}): ${error.message}`);
    }
  }
  event.target.value = "";
}

function onClearHex() {
  hexFiles = [];
  renderFileList();
  mergeAndUpdate();
}

// --- Flash operations ---
async function runProgram() {
  if (!imageContext?.policy?.ok) {
    setStatus("Program blocked: image is missing or failed policy checks");
    return;
  }
  try {
    setStatus("Programming image...");
    await backend.programImage(imageContext.parsed, { mode: imageContext.mode });
    setStatus("Program complete");
  } catch (error) {
    const normalized = normalizeError(error);
    setStatus(`Program failed (${normalized.code}): ${normalized.message}`);
  }
}

async function runVerify() {
  if (!imageContext?.policy?.ok) {
    setStatus("Verify blocked: image is missing or failed policy checks");
    return;
  }
  try {
    setStatus("Verifying image...");
    await backend.verifyImage(imageContext.parsed, { mode: imageContext.mode });
    setStatus("Verify complete");
    // Mark verified regions on the visualizer
    if (imageContext.map) {
      readRegions = imageContext.map.segments.map((s) => ({ start: s.start, size: s.length, ok: true }));
      refreshVisualizer();
    }
  } catch (error) {
    const normalized = normalizeError(error);
    setStatus(`Verify failed (${normalized.code}): ${normalized.message}`);
  }
}

async function runReset() {
  try {
    setStatus("Resetting target...");
    await backend.reset("run");
    setStatus("Reset complete");
  } catch (error) {
    const normalized = normalizeError(error);
    setStatus(`Reset failed (${normalized.code}): ${normalized.message}`);
  }
}

// --- Recovery ---
async function runCheckProtection() {
  try {
    recoveryStatusEl.textContent = "Checking...";
    const result = await backend.checkProtection();
    const msg = result.locked
      ? `LOCKED (APPROTECTSTATUS=0x${result.apProtectStatus.toString(16)})`
      : `Unlocked (APPROTECTSTATUS=0x${result.apProtectStatus.toString(16)})`;
    recoveryStatusEl.textContent = msg;
    log(`Protection check: ${msg}`);
  } catch (error) {
    const normalized = normalizeError(error);
    recoveryStatusEl.textContent = `Check failed: ${normalized.message}`;
    log(`Protection check failed: ${normalized.message}`);
  }
}

async function runRecoverDevice() {
  const confirmed = window.confirm(
    "WARNING: This will erase ALL flash and UICR on the target.\n\nThis cannot be undone. Continue?"
  );
  if (!confirmed) return;
  try {
    recoveryStatusEl.textContent = "Erasing...";
    log("Recovery: starting CTRL-AP mass erase");
    const result = await backend.recoverDevice((prog) => {
      recoveryStatusEl.textContent = prog.busy ? "Erase in progress..." : "Erase done, verifying...";
    });
    const msg = result.unlocked ? "Recovery complete — device unlocked" : "Erase done but device still reports locked";
    recoveryStatusEl.textContent = msg;
    log(`Recovery: ${msg}`);
  } catch (error) {
    const normalized = normalizeError(error);
    recoveryStatusEl.textContent = `Recovery failed: ${normalized.message}`;
    log(`Recovery failed: ${normalized.message}`);
  }
}

// --- Memory read ---
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

async function runReadMemory() {
  const addr = parseHexInput(memAddrInput.value);
  const lenBytes = parseHexInput(memLenInput.value);
  if (isNaN(addr) || isNaN(lenBytes) || lenBytes <= 0) {
    memStatusEl.textContent = "Invalid address or length";
    return;
  }
  const wordCount = Math.ceil(lenBytes / 4);
  memStatusEl.textContent = "Reading...";
  memDumpEl.textContent = "";
  btnMemExport.disabled = true;
  try {
    const words = await backend.adi.readMemBlockFast(addr, wordCount);
    const bytes = new Uint8Array(words.buffer).slice(0, lenBytes);
    lastReadData = { addr, bytes };
    memDumpEl.textContent = formatHexDump(addr, bytes);
    memStatusEl.textContent = `Read ${bytes.length} bytes at 0x${addr.toString(16)}`;
    btnMemExport.disabled = false;
    // Show region on visualizer
    readRegions = [{ start: addr, size: bytes.length, ok: true }];
    refreshVisualizer();
  } catch (error) {
    const normalized = normalizeError(error);
    memStatusEl.textContent = `Read failed: ${normalized.message}`;
    readRegions = [{ start: addr, size: lenBytes, ok: false }];
    refreshVisualizer();
  }
}

async function runReadAllFlash() {
  if (!connected) return;
  const tgt = backend.activeTarget;
  const flashStart = tgt?.flash?.start ?? 0;
  const flashSize = tgt?.flash?.size ?? 1024 * 1024;
  const wordCount = flashSize / 4;
  const chunkWords = backend.adi.maxReadBlockWordCount * 16; // batch multiple blocks

  memStatusEl.textContent = "Reading flash...";
  memDumpEl.textContent = "";
  btnMemExport.disabled = true;

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
      memStatusEl.textContent = `Reading flash... ${percent}%`;
    }
    const bytes = new Uint8Array(allWords.buffer);
    lastReadData = { addr: flashStart, bytes };
    memDumpEl.textContent = formatHexDump(flashStart, bytes.slice(0, 256)); // show first 256B in dump
    memStatusEl.textContent = `Read ${bytes.length} bytes of flash (showing first 256B, export for full)`;
    btnMemExport.disabled = false;
    readRegions = [{ start: flashStart, size: flashSize, ok: true }];
    refreshVisualizer();
  } catch (error) {
    const normalized = normalizeError(error);
    memStatusEl.textContent = `Flash read failed: ${normalized.message}`;
  } finally {
    transport.log = origLog;
  }
}

function exportMemoryBin() {
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

// --- RTT ---
function rttLog(msg) {
  rttLogEl.textContent += msg;
  rttLogEl.scrollTop = rttLogEl.scrollHeight;
}

async function runRttSearch() {
  if (rttClient) { rttClient.stop(); rttClient = null; }
  const ramStart = parseHexInput(rttRamStartInput.value);
  const ramSizeKb = parseInt(rttRamSizeInput.value, 10);
  if (isNaN(ramStart) || isNaN(ramSizeKb) || ramSizeKb <= 0) {
    rttStatusEl.textContent = "Invalid RAM range";
    return;
  }
  const ramSize = ramSizeKb * 1024;
  rttStatusEl.textContent = `Searching 0x${ramStart.toString(16)} + ${ramSizeKb}KB…`;
  btnRttSearch.disabled = true;
  btnRttStart.disabled = true;

  rttClient = new RttClient(backend.adi);
  try {
    const found = await rttClient.search(ramStart, ramSize);
    if (found) {
      rttStatusEl.textContent = `Control block at 0x${rttClient.controlBlockAddr.toString(16)} — ${rttClient._upChannels.length} up, ${rttClient._downChannels.length} down channel(s)`;
      btnRttStart.disabled = false;
      if (rttClient._downChannels.length > 0) {
        rttTxInput.disabled = false;
        btnRttSend.disabled = false;
      }
    } else {
      rttStatusEl.textContent = "RTT control block not found in RAM range";
      rttClient = null;
    }
  } catch (error) {
    rttStatusEl.textContent = `Search failed: ${normalizeError(error).message}`;
    rttClient = null;
  }
  btnRttSearch.disabled = !connected;
}

function runRttStart() {
  if (!rttClient) return;
  const intervalMs = parseInt(rttIntervalInput.value, 10) || 50;
  rttClient
    .on("data", ({ channel, data }) => {
      const text = new TextDecoder().decode(data);
      rttLog(text);
    })
    .on("error", (err) => {
      rttStatusEl.textContent = `Poll error: ${err.message}`;
    });
  rttClient.startPolling(intervalMs);
  rttStatusEl.textContent = `Polling channel(s) every ${intervalMs}ms…`;
  btnRttStart.disabled = true;
  btnRttStop.disabled = false;
}

function runRttStop() {
  if (!rttClient) return;
  rttClient.stop();
  rttStatusEl.textContent = "Stopped";
  btnRttStart.disabled = false;
  btnRttStop.disabled = true;
}

async function runRttSend() {
  if (!rttClient) return;
  const text = rttTxInput.value;
  if (!text) return;
  try {
    const bytes = new TextEncoder().encode(text + "\n");
    await rttClient.write(0, bytes);
    rttTxInput.value = "";
  } catch (error) {
    rttStatusEl.textContent = `Send failed: ${normalizeError(error).message}`;
  }
}

// --- Backend / clock change ---
async function onBackendChanged(event) {
  const name = event.target.value;
  if (connected) await disconnectProbe();
  backend = backendManager.setBackend(name);
  window.localStorage.setItem("backend-name", name);
  log(`Backend selected: ${name}`);
  checkCompatibility();
  updateOperationButtons();
}

function onClockChanged() {
  const hz = parseInt(clockSelect.value, 10);
  backendManager.setSwdClockHz(hz);
  log(`SWD clock set to ${hz / 1000} kHz`);
  if (connected) log("SWD clock change will take effect on next connect.");
}

// --- Event listeners ---
btnConnect.addEventListener("click", connectProbe);
btnDisconnect.addEventListener("click", disconnectProbe);
btnProgram.addEventListener("click", runProgram);
btnVerify.addEventListener("click", runVerify);
btnReset.addEventListener("click", runReset);
fileInput.addEventListener("change", onFirmwareSelected);
btnFetchHex.addEventListener("click", onFetchHex);
btnLoadBuiltin.addEventListener("click", onLoadBuiltin);
btnClearHex.addEventListener("click", onClearHex);
backendSelect.addEventListener("change", onBackendChanged);
clockSelect.addEventListener("change", onClockChanged);
chkConfirmProgram.addEventListener("change", updateOperationButtons);
btnCheckProtection.addEventListener("click", runCheckProtection);
btnRecover.addEventListener("click", runRecoverDevice);
btnMemRead.addEventListener("click", runReadMemory);
btnMemReadFlash.addEventListener("click", runReadAllFlash);
btnMemExport.addEventListener("click", exportMemoryBin);
btnRttSearch.addEventListener("click", runRttSearch);
btnRttStart.addEventListener("click", runRttStart);
btnRttStop.addEventListener("click", runRttStop);
btnRttClear.addEventListener("click", () => { rttLogEl.textContent = ""; });
btnRttSend.addEventListener("click", runRttSend);
rttTxInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runRttSend(); });

document.getElementById("flash-mode-select").addEventListener("change", () => mergeAndUpdate());

targetSelect.addEventListener("change", () => {
  const val = targetSelect.value;
  try {
    backend.setTargetOverride(val === "auto" ? null : val);
    topbarTarget.textContent = backend.activeTarget?.label ?? "Connected";
    log(`Target override: ${val === "auto" ? "auto-detect" : val}`);
    mergeAndUpdate();
    refreshVisualizer();
  } catch (e) {
    log(`Target change failed: ${e.message}`);
  }
});

progressBus.subscribe((event) => {
  log(`[${event.type}] ${event.message}`);
  if (typeof event.percent === "number") {
    setProgress(event.percent < 100 ? event.percent : null);
  }
});

// Collapsible event log
logEl.addEventListener("click", () => {
  logEl.classList.toggle("log-collapsed");
});

// --- Console debug helpers ---
window.diagRead = async (addr = 0x0) => {
  window._imageContext = imageContext;
  window._adi = backend.adi;
  if (!connected) { log("Not connected"); return; }
  try {
    const results = await backend.diagRawRead32(addr);
    for (const [step, msg] of Object.entries(results)) log(`  ${step}: ${msg}`);
    return results;
  } catch (e) { log(`diagRead failed: ${e.message}`); }
};

window.readMem32 = async (addr) => {
  if (!connected) { log("Not connected"); return; }
  try {
    const val = await backend.adi.readMem32(addr);
    log(`readMem32(0x${addr.toString(16)}): 0x${val.toString(16)}`);
    return val;
  } catch (e) { log(`readMem32 failed: ${e.message}`); }
};

window.readMemRange = async (startAddr, count) => {
  if (!connected) { log("Not connected"); return; }
  try {
    const results = [];
    for (let i = 0; i < count; i++) {
      const val = await backend.adi.readMem32(startAddr + i * 4);
      results.push(`0x${val.toString(16)}`);
    }
    log(`readMemRange(0x${startAddr.toString(16)}, ${count}): ${results.join(", ")}`);
    return results;
  } catch (e) { log(`readMemRange failed: ${e.message}`); }
};

window.rawTest = async () => {
  if (!connected) { log("Not connected"); return; }
  const adi = backend.adi;
  const NVMC_BASE = 0x4001e000;
  const NVMC_READY = NVMC_BASE + 0x400;
  const NVMC_CONFIG = NVMC_BASE + 0x504;
  const NVMC_ERASEPAGE = NVMC_BASE + 0x508;
  const waitRdy = async () => { for (let i = 0; i < 200; i++) { if ((await adi.readMem32(NVMC_READY)) & 1) return; } throw new Error("NVMC not ready"); };

  log("rawTest: erasing page 0x27000...");
  await adi.writeMem32(NVMC_CONFIG, 2); await waitRdy();
  await adi.writeMem32(NVMC_ERASEPAGE, 0x27000); await waitRdy();

  log("rawTest: reading erased page...");
  const e0 = await adi.readMem32(0x27000);
  log(`  erased: 0x27000=0x${e0.toString(16)}`);

  log("rawTest: writing via writeMem32...");
  await adi.writeMem32(NVMC_CONFIG, 1); await waitRdy();
  await adi.writeMem32(0x27000, 0xDEADBEEF);
  await waitRdy();
  await adi.writeMem32(NVMC_CONFIG, 0); await waitRdy();

  const r0 = await adi.readMem32(0x27000);
  log(`  readback: 0x27000=0x${r0.toString(16)}, match: ${r0 === 0xDEADBEEF}`);
  return { erased: e0, readback: r0 };
};

window.blockReadTest = async () => {
  if (!connected) { log("Not connected"); return; }
  const adi = backend.adi;
  log(`blockReadTest: reading 8 words at 0x0...`);
  const block = await adi.readMemBlockFast(0x0, 8);
  log(`  block: ${Array.from(block).map(v => "0x" + v.toString(16)).join(", ")}`);
  return Array.from(block);
};

// --- Init ---
if (checkCompatibility()) {
  log(`Backend selected: ${selectedBackendName}`);
  updateOperationButtons();
  refreshVisualizer();
  setStatus("Ready");
}
