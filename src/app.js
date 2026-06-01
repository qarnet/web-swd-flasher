import { BackendManager } from "./core/backend-manager.js";
import { EventBus } from "./core/event-bus.js";
import { Topics } from "./core/event-bus-topics.js";
import { ReadRegionsStore } from "./core/read-regions-store.js";
import { SerialManager } from "./core/serial-manager.js";
import { renderFlashVisualizer } from "./ui/flash-visualizer.js";
import { buildImageMap } from "./hex/image-map.js";
import { BUILD_TIMESTAMP } from "./build-info.js";

import { SwdRecoveryPanel } from "./ui/panels/swd-recovery-panel.js";
import { SwdUicrPanel } from "./ui/panels/swd-uicr-panel.js";
import { SwdDebugPanel } from "./ui/panels/swd-debug-panel.js";
import { SwdMemoryPanel } from "./ui/panels/swd-memory-panel.js";
import { SwdRttPanel } from "./ui/panels/swd-rtt-panel.js";
import { SwdFirmwarePanel } from "./ui/panels/swd-firmware-panel.js";
import { SwdConnectionPanel } from "./ui/panels/swd-connection-panel.js";
import { SerialConnectionPanel } from "./ui/panels/serial-connection-panel.js";
import { SerialTerminalPanel } from "./ui/panels/serial-terminal-panel.js";
import { createPanelLogger } from "./ui/components/panel-logger.js";
import { TabController, ModeController } from "./ui/components/tab-controller.js";
import { renderBuildTimestamp } from "./ui/components/topbar-build-badge.js";

import * as logger from "./ui/logger.js";

let bus, readRegions;
let backendManager;
let serialManager;
let backend = null;
const backendProvider = () => backend;

function refreshVisualizer({ context, hexFiles } = {}) {
  const visualizerEl = document.getElementById("flash-visualizer");
  if (!backend || !visualizerEl) return;

  const files = context
    ? [
        {
          name: "merged",
          color: "#2c6e49",
          segments: context.map.segments,
        },
      ]
    : (hexFiles || []).map((f) => ({
        name: f.name,
        color: f.color,
        segments: buildImageMap(f.parsed).segments,
      }));

  const target = backend.activeTarget;
  renderFlashVisualizer(visualizerEl, {
    flashStart: target?.flash?.start ?? 0,
    flashSize: target?.flash?.size ?? 0x100000,
    targetId: target?.id ?? "unknown",
    namedRegions: target?.namedRegions ?? [],
    files,
    readRegions: readRegions?.regions ?? [],
  });
}

async function init() {
  const logEl = document.getElementById("log");
  const serialLogEl = document.getElementById("serial-log");
  const flashProgressBar = document.getElementById("flash-progress-bar");
  const flashProgressFill = document.getElementById("progress-fill");
  const flashProgressLabel = document.getElementById("flash-progress-label");
  const chkVerbose = document.getElementById("chk-verbose");
  const backendSelect = document.getElementById("backend-select");

  bus = new EventBus();
  readRegions = new ReadRegionsStore(bus);
  backendManager = new BackendManager(bus, (msg, verbose) => verbose ? logger.logVerbose(msg) : logger.log(msg));
  serialManager = new SerialManager(bus);

  const savedBackend = window.localStorage.getItem("backend-name") || "cmsis-dap";
  backendSelect.value = savedBackend;

  logger.init({
    statusEl: document.getElementById("status"),
    logEl,
    statusLed: document.getElementById("status-led"),
    topbarTarget: document.getElementById("topbar-target"),
    btnTheme: document.getElementById("btn-theme"),
    chkVerbose,
  });

  // Theme toggle
  document.getElementById("btn-theme")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  });

  const serialLogger = createPanelLogger(serialLogEl, { source: "serial" });

  // Panels
  const connectionPanel = new SwdConnectionPanel({ bus, backendProvider, backendManager, logger });
  connectionPanel.mount(document.getElementById("tab-connection"));

  const recoveryPanel = new SwdRecoveryPanel({ bus, backendProvider, logger });
  recoveryPanel.mount(document.getElementById("tab-recovery"));

  const firmwarePanel = new SwdFirmwarePanel({ bus, readRegions, backendProvider, logger });
  firmwarePanel.mount(document.getElementById("tab-firmware"));

  const debugPanel = new SwdDebugPanel({ bus, backendProvider, logger });
  debugPanel.mount(document.getElementById("tab-debug"));

  const memoryPanel = new SwdMemoryPanel({ bus, readRegions, backendProvider, logger });
  memoryPanel.mount(document.getElementById("tab-memory"));

  const uicrPanel = new SwdUicrPanel({ bus, backendProvider, logger });
  uicrPanel.mount(document.getElementById("tab-uicr"));

  const rttPanel = new SwdRttPanel({ bus, backendProvider, logger });
  rttPanel.mount(document.getElementById("tab-rtt"));

  const serialConnectionPanel = new SerialConnectionPanel({ bus, serialManager });
  serialConnectionPanel.mount(document.getElementById("serial-connection-panel"));

  const serialTerminalPanel = new SerialTerminalPanel({ bus, serialManager });
  serialTerminalPanel.mount(document.getElementById("serial-terminal-panel"));

  navigator.serial?.addEventListener("disconnect", (e) => {
    if (serialManager._uart?._port === e.target) {
      serialConnectionPanel.onUnexpectedDisconnect();
    }
  });

  // Tab + mode controllers
  new TabController({
    containerSelector: "#section-swd",
    buttonSelector: "#section-swd .tab-btn",
    panelSelector: "#section-swd .tab-panel",
    defaultTab: "connection",
  });
  new ModeController({
    sectionMap: {
      swd: document.getElementById("section-swd"),
      serial: document.getElementById("section-serial"),
    },
  });

  // Event subscriptions
  bus.on(Topics.LOG_LINE, ({ source, message }) => {
    if (source === "serial") serialLogger.log(message);
  });

  bus.on(Topics.IMAGE_CHANGED, (payload) => refreshVisualizer(payload));
  bus.on(Topics.READ_REGIONS_CHANGED, () => refreshVisualizer());
  bus.on(Topics.BACKEND_CONNECTED, ({ backend: b }) => { backend = b; refreshVisualizer(); });
  bus.on(Topics.BACKEND_DISCONNECTED, () => { backend = null; refreshVisualizer(); });

  function setFlashProgress(percent, label) {
    if (percent === null) {
      flashProgressBar.hidden = true;
      flashProgressFill.style.width = "0%";
      flashProgressLabel.hidden = true;
    } else {
      const pct = Math.max(0, Math.min(100, percent));
      flashProgressBar.hidden = false;
      flashProgressFill.style.width = `${pct}%`;
      flashProgressLabel.hidden = false;
      flashProgressLabel.textContent = label ? `${label} — ${pct}%` : `${pct}%`;
    }
  }

  bus.on(Topics.FLASH_PROGRESS, ({ kind, percent, message }) => {
    setFlashProgress(percent, kind === "verify" ? "Verifying" : "Programming");
    if (message) logger.log(message);
    if (percent >= 100) setTimeout(() => setFlashProgress(null), 1500);
  });

  logEl.addEventListener("click", function() { this.classList.toggle("log-collapsed"); });
  serialLogEl.addEventListener("click", function() { this.classList.toggle("log-collapsed"); });

  document.getElementById("btn-log-clear").addEventListener("click", logger.clearLog);
  document.getElementById("btn-log-download").addEventListener("click", logger.downloadLogContent);
  chkVerbose.addEventListener("change", () => { logger.setVerbose(chkVerbose.checked); });

  document.getElementById("btn-serial-log-clear").addEventListener("click", serialLogger.clearLog);
  document.getElementById("btn-serial-log-download").addEventListener("click", () => serialLogger.downloadLogContent("serial-event-log"));

  renderBuildTimestamp(document.getElementById("topbar-build-time"), BUILD_TIMESTAMP);
  logger.setStatus("Ready");
}

document.addEventListener("DOMContentLoaded", init);
