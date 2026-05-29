import { normalizeError } from "../core/errors.js";

let elements, logger, hexManager, connection;
let onRefreshVisualizerCallback;

export function init(els, log, hm, conn) {
  elements = els;
  logger = log;
  hexManager = hm;
  connection = conn;
}

export function setRefreshVisualizerCallback(fn) {
  onRefreshVisualizerCallback = fn;
}

export function updateOperationButtons() {
  const imageContext = hexManager.getImageContext();
  const imageReady = imageContext?.policy?.ok === true;
  const confirmed = elements.chkConfirmProgram.checked;
  const backend = connection.getBackend();
  const connected = connection.isConnected();
  const caps = connected ? backend.capabilities() : { supportsFlash: false, supportsVerify: false, supportsReset: false };

  elements.btnProgram.disabled = !(connected && imageReady && confirmed && caps.supportsFlash);
  elements.btnVerify.disabled = !(connected && imageReady && confirmed && caps.supportsVerify);
  elements.btnReset.disabled = !(connected && caps.supportsReset);
  elements.btnProgramVerifyReset.disabled = !(connected && imageReady && confirmed && caps.supportsFlash && caps.supportsVerify && caps.supportsReset);
}

export async function runProgram() {
  const imageContext = hexManager.getImageContext();
  if (!imageContext?.policy?.ok) {
    logger.setStatus("Program blocked: image is missing or failed policy checks");
    return;
  }
  const backend = connection.getBackend();
  try {
    logger.setStatus("Programming image...");
    await backend.programImage(imageContext.parsed, { mode: imageContext.mode });
    logger.setStatus("Program complete");
  } catch (error) {
    const normalized = normalizeError(error);
    logger.setStatus(`Program failed (${normalized.code}): ${normalized.message}`);
  }
}

export async function runVerify() {
  const imageContext = hexManager.getImageContext();
  if (!imageContext?.policy?.ok) {
    logger.setStatus("Verify blocked: image is missing or failed policy checks");
    return;
  }
  const backend = connection.getBackend();
  try {
    logger.setStatus("Verifying image...");
    await backend.verifyImage(imageContext.parsed, { mode: imageContext.mode });
    logger.setStatus("Verify complete");
    if (imageContext.map && onRefreshVisualizerCallback) {
      window.readRegions = imageContext.map.segments.map((s) => ({ start: s.start, size: s.length, ok: true }));
      onRefreshVisualizerCallback();
    }
  } catch (error) {
    const normalized = normalizeError(error);
    logger.setStatus(`Verify failed (${normalized.code}): ${normalized.message}`);
  }
}

export async function runReset() {
  const backend = connection.getBackend();
  try {
    logger.setStatus("Resetting target...");
    await backend.reset("run");
    logger.setStatus("Reset complete");
  } catch (error) {
    const normalized = normalizeError(error);
    logger.setStatus(`Reset failed (${normalized.code}): ${normalized.message}`);
  }
}

export async function runProgramVerifyReset() {
  const imageContext = hexManager.getImageContext();
  if (!imageContext?.policy?.ok) {
    logger.setStatus("Program blocked: image is missing or failed policy checks");
    return;
  }
  const backend = connection.getBackend();
  try {
    logger.setStatus("Programming image...");
    await backend.programImage(imageContext.parsed, { mode: imageContext.mode });
    logger.setStatus("Verifying image...");
    await backend.verifyImage(imageContext.parsed, { mode: imageContext.mode });
    if (imageContext.map && onRefreshVisualizerCallback) {
      window.readRegions = imageContext.map.segments.map((s) => ({ start: s.start, size: s.length, ok: true }));
      onRefreshVisualizerCallback();
    }
    logger.setStatus("Resetting target...");
    await backend.reset("run");
    logger.setStatus("Program → Verify → Reset complete");
  } catch (error) {
    const normalized = normalizeError(error);
    logger.setStatus(`Operation failed (${normalized.code}): ${normalized.message}`);
  }
}

export function onConnect(backend) {
  updateOperationButtons();
}

export function onDisconnect() {
  elements.btnProgram.disabled = true;
  elements.btnVerify.disabled = true;
  elements.btnReset.disabled = true;
  elements.btnProgramVerifyReset.disabled = true;
}
