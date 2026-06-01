import { BackendManager } from "./core/backend-manager.js";
import { ProgressBus } from "./core/progress.js";
import { renderFlashVisualizer } from "./ui/flash-visualizer.js";
import { buildImageMap } from "./hex/image-map.js";
import { BUILD_TIMESTAMP } from "./build-info.js";

// UI Modules
import * as logger from "./ui/logger.js";
import * as settings from "./ui/settings.js";
import * as connection from "./ui/connection.js";
import * as hexManager from "./ui/hex-manager.js";
import * as flashOps from "./ui/flash-ops.js";
import * as recovery from "./ui/recovery.js";
import * as memory from "./ui/memory.js";
import * as uicr from "./ui/uicr.js";
import * as debug from "./ui/debug.js";
import * as rtt from "./ui/rtt-panel.js";
import * as uart from "./ui/uart-panel.js";
import * as swo from "./ui/swo-panel.js";

// Global state
let progressBus, backendManager;
window.readRegions = [];

// Gather all DOM elements
function gatherElements() {
  return {
    // Topbar
    statusEl: document.getElementById("status"),
    statusLed: document.getElementById("status-led"),
    topbarTarget: document.getElementById("topbar-target"),
    btnTheme: document.getElementById("btn-theme"),

    // Compat banner
    compatBanner: document.getElementById("compat-banner"),
    compatMsg: document.getElementById("compat-msg"),

    // Connection
    backendSelect: document.getElementById("backend-select"),
    clockSelect: document.getElementById("clock-select"),
    btnConnect: document.getElementById("btn-connect"),
    btnDisconnect: document.getElementById("btn-disconnect"),
    targetSelect: document.getElementById("target-select"),
    targetInfoEl: document.getElementById("target-info"),
    probeCapsEl: document.getElementById("probe-caps"),
    progressBar: document.getElementById("progress-bar"),
    progressFill: document.getElementById("progress-fill"),
    flashProgressBar: document.getElementById("flash-progress-bar"),
    flashProgressFill: document.getElementById("flash-progress-fill"),
    flashProgressLabel: document.getElementById("flash-progress-label"),

    // Hex management
    fileInput: document.getElementById("file-input"),
    urlInput: document.getElementById("url-input"),
    builtinSelect: document.getElementById("builtin-select"),
    btnFetchHex: document.getElementById("btn-fetch-hex"),
    btnLoadBuiltin: document.getElementById("btn-load-builtin"),
    btnClearHex: document.getElementById("btn-clear-hex"),
    fileListEl: document.getElementById("file-list"),
    imageSummary: document.getElementById("image-summary"),
    imageMapEl: document.getElementById("image-map"),
    flashModeSelect: document.getElementById("flash-mode-select"),
    flashVisualizerEl: document.getElementById("flash-visualizer"),

    // Flash operations
    btnProgram: document.getElementById("btn-program"),
    btnVerify: document.getElementById("btn-verify"),
    btnReset: document.getElementById("btn-reset"),
    btnProgramVerifyReset: document.getElementById("btn-program-verify-reset"),
    chkConfirmProgram: document.getElementById("chk-confirm-program"),

    // Recovery
    btnCheckProtection: document.getElementById("btn-check-protection"),
    btnRecover: document.getElementById("btn-recover"),
    recoveryStatusEl: document.getElementById("recovery-status"),

    // Memory
    memAddrInput: document.getElementById("mem-addr-input"),
    memLenInput: document.getElementById("mem-len-input"),
    btnMemRead: document.getElementById("btn-mem-read"),
    btnMemReadFlash: document.getElementById("btn-mem-read-flash"),
    btnMemExport: document.getElementById("btn-mem-export"),
    btnMemExportHex: document.getElementById("btn-mem-export-hex"),
    memStatusEl: document.getElementById("mem-status"),
    memDumpEl: document.getElementById("mem-dump"),

    // UICR
    btnUicrRead: document.getElementById("btn-uicr-read"),
    uicrStatusEl: document.getElementById("uicr-status"),
    uicrDumpEl: document.getElementById("uicr-dump"),

    // Debug
    btnCoreHalt: document.getElementById("btn-core-halt"),
    btnCoreResume: document.getElementById("btn-core-resume"),
    btnCoreStep: document.getElementById("btn-core-step"),
    btnCoreRegs: document.getElementById("btn-core-regs"),
    debugStatusEl: document.getElementById("debug-status"),
    debugRegsEl: document.getElementById("debug-regs"),

    // RTT
    rttRamStartInput: document.getElementById("rtt-ram-start"),
    rttRamSizeInput: document.getElementById("rtt-ram-size"),
    rttIntervalInput: document.getElementById("rtt-interval"),
    btnRttSearch: document.getElementById("btn-rtt-search"),
    btnRttStart: document.getElementById("btn-rtt-start"),
    btnRttStop: document.getElementById("btn-rtt-stop"),
    btnRttClear: document.getElementById("btn-rtt-clear"),
    rttStatusEl: document.getElementById("rtt-status"),
    rttLogEl: document.getElementById("rtt-log"),
    rttTxInput: document.getElementById("rtt-tx-input"),
    btnRttSend: document.getElementById("btn-rtt-send"),

    // UART
    uartBaudSelect: document.getElementById("uart-baud-select"),
    btnUartOpen: document.getElementById("btn-uart-open"),
    btnUartClose: document.getElementById("btn-uart-close"),
    btnUartClear: document.getElementById("btn-uart-clear"),
    uartStatusEl: document.getElementById("uart-status"),
    uartLogEl: document.getElementById("uart-log"),
    uartTxInput: document.getElementById("uart-tx-input"),
    btnUartSend: document.getElementById("btn-uart-send"),

    // SWO
    swoBaudInput: document.getElementById("swo-baud-input"),
    btnSwoOpen: document.getElementById("btn-swo-open"),
    btnSwoClose: document.getElementById("btn-swo-close"),
    btnSwoClear: document.getElementById("btn-swo-clear"),
    swoStatusEl: document.getElementById("swo-status"),
    swoLogEl: document.getElementById("swo-log"),
    swoPanelEl: document.getElementById("swo-panel"),

    // Event log
    logEl: document.getElementById("log"),
  };
}

function refreshVisualizer() {
  const els = gatherElements();
  const backend = connection.getBackend();
  if (!backend || !els.flashVisualizerEl) return;

  const imageContext = hexManager.getImageContext();
  const hexFiles = hexManager.getHexFiles();
  const files = imageContext
    ? [
        {
          name: "merged",
          color: "#2c6e49",
          segments: imageContext.map.segments,
        },
      ]
    : hexFiles.map((f) => ({
        name: f.name,
        color: f.color,
        segments: buildImageMap(f.parsed).segments,
      }));

  const target = backend.activeTarget;
  const props = {
    flashStart: target?.flash?.start ?? 0,
    flashSize: target?.flash?.size ?? 0x100000,
    targetId: target?.id ?? "unknown",
    files,
    readRegions: window.readRegions || [],
  };

  renderFlashVisualizer(els.flashVisualizerEl, props);
}

async function init() {
  const els = gatherElements();

  // Initialize global services
  progressBus = new ProgressBus();
  backendManager = new BackendManager(
    progressBus,
    (msg) => logger.log(msg)
  );

  // Read saved backend from localStorage
  const savedBackend = window.localStorage.getItem("backend-name") || "cmsis-dap";
  els.backendSelect.value = savedBackend;

  // Initialize all UI modules
  logger.init(els);
  settings.init(els);
  connection.init(els, logger, backendManager);
  hexManager.init(els, logger, connection);
  flashOps.init(els, logger, hexManager, connection);
  recovery.init(els, logger, connection);
  memory.init(els, logger, connection);
  uicr.init(els, logger, connection);
  debug.init(els, logger, connection);
  rtt.init(els, logger, connection);
  uart.init(els, logger, connection);
  swo.init(els, logger, connection);

  // Setup callbacks for connection state changes
  connection.setConnectedCallback((backend) => {
    logger.log("Connected");
    flashOps.onConnect(backend);
    recovery.onConnect(backend);
    memory.onConnect(backend);
    uicr.onConnect(backend);
    debug.onConnect(backend);
    rtt.onConnect(backend);
    uart.onConnect(backend);
    swo.onConnect(backend);
    hexManager.onConnect(backend);
    refreshVisualizer();
  });

  connection.setDisconnectedCallback(() => {
    logger.log("Disconnected");
    flashOps.onDisconnect();
    recovery.onDisconnect();
    memory.onDisconnect();
    uicr.onDisconnect();
    debug.onDisconnect();
    rtt.onDisconnect();
    uart.onDisconnect();
    swo.onDisconnect();
    hexManager.onDisconnect();
    refreshVisualizer();
  });

  // Setup callbacks for image changes
  hexManager.setOnImageChangeCallback(() => {
    flashOps.updateOperationButtons();
    refreshVisualizer();
  });

  // Setup visualizer refresh callbacks
  flashOps.setRefreshVisualizerCallback(refreshVisualizer);
  memory.setRefreshVisualizerCallback(refreshVisualizer);

  // Wire event listeners
  els.btnConnect.addEventListener("click", connection.connectProbe);
  els.btnDisconnect.addEventListener("click", connection.disconnectProbe);

  els.btnFetchHex.addEventListener("click", hexManager.onFetchHex);
  els.btnLoadBuiltin.addEventListener("click", hexManager.onLoadBuiltin);
  els.fileInput.addEventListener("change", hexManager.onFirmwareSelected);
  els.btnClearHex.addEventListener("click", hexManager.onClearHex);

  els.btnProgram.addEventListener("click", flashOps.runProgram);
  els.btnVerify.addEventListener("click", flashOps.runVerify);
  els.btnReset.addEventListener("click", flashOps.runReset);
  els.btnProgramVerifyReset.addEventListener("click", flashOps.runProgramVerifyReset);
  els.chkConfirmProgram.addEventListener("change", () => flashOps.updateOperationButtons());

  els.btnCheckProtection.addEventListener("click", recovery.runCheckProtection);
  els.btnRecover.addEventListener("click", recovery.runRecoverDevice);

  els.btnMemRead.addEventListener("click", memory.runReadMemory);
  els.btnMemReadFlash.addEventListener("click", memory.runReadAllFlash);
  els.btnMemExport.addEventListener("click", memory.exportMemoryBin);
  els.btnMemExportHex.addEventListener("click", memory.exportMemoryHex);

  els.btnUicrRead.addEventListener("click", uicr.runUicrRead);

  els.btnCoreHalt.addEventListener("click", debug.runCoreHalt);
  els.btnCoreResume.addEventListener("click", debug.runCoreResume);
  els.btnCoreStep.addEventListener("click", debug.runCoreStep);
  els.btnCoreRegs.addEventListener("click", debug.runCoreRegs);

  els.btnRttSearch.addEventListener("click", rtt.runRttSearch);
  els.btnRttStart.addEventListener("click", rtt.runRttStart);
  els.btnRttStop.addEventListener("click", rtt.runRttStop);
  els.btnRttClear.addEventListener("click", () => { els.rttLogEl.textContent = ""; });
  els.btnRttSend.addEventListener("click", rtt.runRttSend);

  els.btnUartOpen.addEventListener("click", uart.openUartSession);
  els.btnUartClose.addEventListener("click", uart.closeUartSession);
  els.btnUartClear.addEventListener("click", () => { els.uartLogEl.textContent = ""; });
  els.btnUartSend.addEventListener("click", uart.sendUartData);

  els.btnSwoOpen.addEventListener("click", swo.openSwoSession);
  els.btnSwoClose.addEventListener("click", swo.closeSwoSession);
  els.btnSwoClear.addEventListener("click", () => { els.swoLogEl.textContent = ""; });

  els.backendSelect.addEventListener("change", connection.onBackendChanged);
  els.clockSelect.addEventListener("change", connection.onClockChanged);

  // Progress bus subscription
  function setFlashProgress(percent, label) {
    const els2 = gatherElements();
    if (percent === null) {
      els2.flashProgressBar.hidden = true;
      els2.flashProgressFill.style.width = "0%";
      els2.flashProgressLabel.hidden = true;
    } else {
      const pct = Math.max(0, Math.min(100, percent));
      els2.flashProgressBar.hidden = false;
      els2.flashProgressFill.style.width = `${pct}%`;
      els2.flashProgressLabel.hidden = false;
      els2.flashProgressLabel.textContent = label ? `${label} — ${pct}%` : `${pct}%`;
    }
  }

  progressBus.subscribe((event) => {
    if (event.type === "progress") {
      connection.setProgress(event.percent);
    } else if (event.type === "program" || event.type === "verify") {
      setFlashProgress(event.percent, event.type === "verify" ? "Verifying" : "Programming");
      if (event.message) logger.log(event.message);
      if (event.percent >= 100) setTimeout(() => setFlashProgress(null), 1500);
    } else if (event.type === "log") {
      logger.log(event.message);
    }
  });

  // Collapsible log
  els.logEl.addEventListener("click", function() {
    this.classList.toggle("log-collapsed");
  });

  // Tab switching
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");
  function switchTab(tabId) {
    tabBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabId));
    tabPanels.forEach(panel => { panel.hidden = panel.id !== `tab-${tabId}`; });
  }
  tabBtns.forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

  // Compatibility check
  connection.checkCompatibility();
  flashOps.updateOperationButtons();
  refreshVisualizer();
  const buildTimeEl = document.getElementById("topbar-build-time");
  if (buildTimeEl && BUILD_TIMESTAMP !== "__BUILD_TIMESTAMP__") {
    const ts = BUILD_TIMESTAMP.endsWith("Z") ? BUILD_TIMESTAMP : BUILD_TIMESTAMP + "Z";
    const d = new Date(ts);
    buildTimeEl.textContent = isNaN(d) ? BUILD_TIMESTAMP : d.toLocaleString();
  }
  logger.setStatus("Ready");
}

// Wait for DOM
document.addEventListener("DOMContentLoaded", init);
