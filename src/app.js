import { BackendManager } from "./core/backend-manager.js";
import { normalizeError } from "./core/errors.js";
import { ProgressBus } from "./core/progress.js";
import { parseIntelHexFileText } from "./hex/intel-hex-parser.js";
import { buildImageMap, formatImageMap } from "./hex/image-map.js";
import { validateAppRange } from "./nrf/nrf52-memory-map.js";
import { formatFicrInfo } from "./nrf/nrf52-ficr.js";

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

const progressBus = new ProgressBus();
const backendManager = new BackendManager(progressBus);
const backendParam = new URLSearchParams(window.location.search).get("backend");
const storedBackendName = window.localStorage.getItem("backend-name");
const selectedBackendName = backendParam || storedBackendName || "mock";
backendSelect.value = selectedBackendName;
let backend = backendManager.getBackend(selectedBackendName);
let imageContext = null;
let connected = false;

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(message) {
  statusEl.textContent = message;
  log(message);
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
  if (target.ficr) {
    lines.push(`FICR part: 0x${target.ficr.part.toString(16)}`);
    lines.push(`FICR variant: 0x${target.ficr.variant.toString(16)}`);
    lines.push(`FICR package: 0x${target.ficr.package.toString(16)}`);
    lines.push(`FICR ram: ${target.ficr.ram}`);
    lines.push(`FICR flash: ${target.ficr.flash}`);
  }
  targetInfoEl.textContent = lines.join("\n");
}

function setConnected(connected) {
  window.connectedState = connected;
  btnConnect.disabled = connected;
  btnDisconnect.disabled = !connected;
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

async function connectProbe() {
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
    setConnected(true);
    setStatus(`Connected: ${probe.name} via ${probe.transport}; target ${target.part}`);
    renderTargetInfo(probe, target);
    if (target.ficr) {
      log(`FICR: ${formatFicrInfo(target.ficr)}`);
    }
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
}

async function onFirmwareSelected(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = parseIntelHexFileText(text);
    const map = buildImageMap(parsed);
    const policy = validateAppRange(map);
    imageContext = { parsed, map, policy };

    imageMapEl.textContent = formatImageMap(map);
    if (policy.ok) {
      imageSummary.textContent = `Image accepted (${parsed.byteCount} bytes).`;
      log("Firmware image passed range policy checks.");
    } else {
      imageSummary.textContent = "Image rejected by range policy.";
      for (const issue of policy.violations) {
        log(`Policy violation: ${issue}`);
      }
    }
    updateOperationButtons();
  } catch (error) {
    imageContext = null;
    imageMapEl.textContent = "";
    imageSummary.textContent = `Image parse failed: ${error.message}`;
    log(`Image parse failed: ${error.message}`);
    updateOperationButtons();
  }
}

async function runProgram() {
  if (!imageContext?.policy?.ok) {
    setStatus("Program blocked: image is missing or failed policy checks");
    return;
  }
  try {
    setStatus("Programming image...");
    await backend.programImage(imageContext.parsed, { mode: "app-only" });
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
    await backend.verifyImage(imageContext.parsed, { mode: "app-only" });
    setStatus("Verify complete");
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

async function onBackendChanged(event) {
  const name = event.target.value;
  if (connected) {
    await disconnectProbe();
  }
  backend = backendManager.setBackend(name);
  window.localStorage.setItem("backend-name", name);
  log(`Backend selected: ${name}`);
  updateOperationButtons();
}

btnConnect.addEventListener("click", connectProbe);
btnDisconnect.addEventListener("click", disconnectProbe);
btnProgram.addEventListener("click", runProgram);
btnVerify.addEventListener("click", runVerify);
btnReset.addEventListener("click", runReset);
fileInput.addEventListener("change", onFirmwareSelected);
backendSelect.addEventListener("change", onBackendChanged);
chkConfirmProgram.addEventListener("change", updateOperationButtons);

progressBus.subscribe((event) => {
  log(`[${event.type}] ${event.message}`);
});

if (checkCompatibility()) {
  log(`Backend selected: ${selectedBackendName}`);
  updateOperationButtons();
  setStatus("Ready");
}
