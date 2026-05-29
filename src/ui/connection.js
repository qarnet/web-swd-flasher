import { normalizeError } from "../core/errors.js";
import { formatFicrInfo } from "../nrf/nrf52-ficr.js";

let elements, logger, backendManager, backend;
let onConnectedCallback, onDisconnectedCallback;
let connected = false;

export function init(els, log, mgr) {
  elements = els;
  logger = log;
  backendManager = mgr;
  backend = backendManager.getBackend();
}

export function setConnectedCallback(fn) {
  onConnectedCallback = fn;
}

export function setDisconnectedCallback(fn) {
  onDisconnectedCallback = fn;
}

export function getBackend() {
  return backend;
}

export function isConnected() {
  return connected;
}

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
  elements.targetInfoEl.textContent = lines.join("\n");
  elements.targetInfoEl.hidden = false;

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
    elements.probeCapsEl.textContent = caps.join("\n");
    elements.probeCapsEl.hidden = false;
  }
}

function populateTargetSelector() {
  const targets = backend.availableTargets ?? [];
  while (elements.targetSelect.options.length > 1) elements.targetSelect.remove(1);
  for (const t of targets) {
    if (t.id === "generic") continue;
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.label;
    elements.targetSelect.appendChild(opt);
  }
}

export function setProgress(percent) {
  if (percent === null) {
    elements.progressBar.hidden = true;
    elements.progressFill.style.width = "0%";
  } else {
    elements.progressBar.hidden = false;
    elements.progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }
}

export function checkCompatibility() {
  if (!window.isSecureContext) {
    elements.compatMsg.textContent = "Secure context required (use localhost).";
    elements.compatBanner.hidden = false;
    elements.btnConnect.disabled = true;
    return false;
  }
  if (!navigator.usb) {
    elements.compatMsg.textContent = "navigator.usb unavailable in this browser profile.";
    elements.compatBanner.hidden = false;
    elements.btnConnect.disabled = true;
    return false;
  }
  elements.compatBanner.hidden = true;
  return true;
}

export async function connectProbe() {
  const name = elements.backendSelect.value;
  backend = backendManager.setBackend(name);
  try {
    const known = await backend.getAuthorizedDevices();
    if (known.length > 0) {
      logger.log(`Found ${known.length} previously authorized USB device(s).`);
    }
    logger.setStatus("Selecting probe...");
    await backend.requestDevice();
    await backend.connect();
    const probe = await backend.getProbeInfo();
    const target = await backend.getTargetInfo();
    connected = true;
    populateTargetSelector();
    if (target.id && target.id !== "generic") {
      elements.targetSelect.value = target.id;
    }
    const detectNote = target.autoDetected ? "(auto-detected)" : "(manual)";
    logger.setStatus(`Connected: ${probe.name} via ${probe.transport}; target ${target.part} ${detectNote}`);
    logger.setLed(true);
    logger.setTopbarTarget(backend.activeTarget?.label ?? "Connected");
    renderTargetInfo(probe, target);
    if (target.ficr) {
      logger.log(`FICR: ${formatFicrInfo(target.ficr)}`);
    }
    elements.btnConnect.disabled = true;
    elements.btnDisconnect.disabled = false;
    elements.targetSelect.disabled = false;
    if (onConnectedCallback) onConnectedCallback(backend);
  } catch (error) {
    const normalized = normalizeError(error);
    logger.setStatus(`Connect failed (${normalized.code}): ${normalized.message}`);
  }
}

export async function disconnectProbe() {
  try {
    await backend.disconnect();
  } catch (error) {
    logger.log(`Close warning: ${error.message}`);
  }
  connected = false;
  logger.setStatus("Disconnected");
  logger.setLed(false);
  logger.setTopbarTarget("Not connected");
  elements.targetInfoEl.textContent = "";
  elements.targetInfoEl.hidden = true;
  elements.probeCapsEl.hidden = true;
  elements.probeCapsEl.textContent = "";
  elements.btnConnect.disabled = false;
  elements.btnDisconnect.disabled = true;
  elements.targetSelect.disabled = true;
  elements.targetSelect.value = "auto";
  if (onDisconnectedCallback) onDisconnectedCallback();
}

export async function onBackendChanged(event) {
  const name = event.target.value;
  if (connected) await disconnectProbe();
  backend = backendManager.setBackend(name);
  window.localStorage.setItem("backend-name", name);
  logger.log(`Backend selected: ${name}`);
  checkCompatibility();
}

export function onClockChanged() {
  const hz = parseInt(elements.clockSelect.value, 10);
  backendManager.setSwdClockHz(hz);
  logger.log(`SWD clock set to ${hz / 1000} kHz`);
  if (connected) logger.log("SWD clock change will take effect on next connect.");
}
