import { BackendManager } from "./core/backend-manager.js";
import { normalizeError } from "./core/errors.js";
import { ProgressBus } from "./core/progress.js";
import { parseIntelHexFileText } from "./hex/intel-hex-parser.js";
import { buildImageMap, formatImageMap } from "./hex/image-map.js";
import { validateAppRange } from "./nrf/nrf52-memory-map.js";

const compatBanner = document.getElementById("compat-banner");
const compatMsg = document.getElementById("compat-msg");
const btnConnect = document.getElementById("btn-connect");
const btnDisconnect = document.getElementById("btn-disconnect");
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const fileInput = document.getElementById("file-input");
const imageSummary = document.getElementById("image-summary");
const imageMapEl = document.getElementById("image-map");

const progressBus = new ProgressBus();
const backendManager = new BackendManager(progressBus);
const backend = backendManager.getBackend();
let imageContext = null;

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(message) {
  statusEl.textContent = message;
  log(message);
}

function setConnected(connected) {
  btnConnect.disabled = connected;
  btnDisconnect.disabled = !connected;
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
    setStatus("Selecting probe...");
    await backend.requestDevice();
    await backend.connect();
    const probe = await backend.getProbeInfo();
    const target = await backend.getTargetInfo();
    setConnected(true);
    setStatus(`Connected: ${probe.name} via ${probe.transport}; target ${target.part}`);
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
  setConnected(false);
  setStatus("Disconnected");
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
  } catch (error) {
    imageContext = null;
    imageMapEl.textContent = "";
    imageSummary.textContent = `Image parse failed: ${error.message}`;
    log(`Image parse failed: ${error.message}`);
  }
}

btnConnect.addEventListener("click", connectProbe);
btnDisconnect.addEventListener("click", disconnectProbe);
fileInput.addEventListener("change", onFirmwareSelected);

progressBus.subscribe((event) => {
  log(`[${event.type}] ${event.message}`);
});

if (checkCompatibility()) {
  setStatus("Ready");
}
