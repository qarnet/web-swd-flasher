import { normalizeError } from "../core/errors.js";

let elements, logger, connection;

export function init(els, log, conn) {
  elements = els;
  logger = log;
  connection = conn;
}

export async function runCheckProtection() {
  const backend = connection.getBackend();
  try {
    elements.recoveryStatusEl.textContent = "Checking...";
    const result = await backend.checkProtection();
    const msg = result.locked
      ? `LOCKED (APPROTECTSTATUS=0x${result.apProtectStatus.toString(16)})`
      : `Unlocked (APPROTECTSTATUS=0x${result.apProtectStatus.toString(16)})`;
    elements.recoveryStatusEl.textContent = msg;
    logger.log(`Protection check: ${msg}`);
  } catch (error) {
    const normalized = normalizeError(error);
    elements.recoveryStatusEl.textContent = `Check failed: ${normalized.message}`;
    logger.log(`Protection check failed: ${normalized.message}`);
  }
}

export async function runRecoverDevice() {
  const confirmed = window.confirm(
    "WARNING: This will erase ALL flash and UICR on the target.\n\nThis cannot be undone. Continue?"
  );
  if (!confirmed) return;
  const backend = connection.getBackend();
  try {
    elements.recoveryStatusEl.textContent = "Erasing...";
    logger.log("Recovery: starting CTRL-AP mass erase");
    const result = await backend.recoverDevice((prog) => {
      elements.recoveryStatusEl.textContent = prog.busy ? "Erase in progress..." : "Erase done, verifying...";
    });
    const msg = result.unlocked ? "Recovery complete — device unlocked" : "Erase done but device still reports locked";
    elements.recoveryStatusEl.textContent = msg;
    logger.log(`Recovery: ${msg}`);
  } catch (error) {
    const normalized = normalizeError(error);
    elements.recoveryStatusEl.textContent = `Recovery failed: ${normalized.message}`;
    logger.log(`Recovery failed: ${normalized.message}`);
  }
}

export function onConnect(backend) {
  elements.btnCheckProtection.disabled = false;
  elements.btnRecover.disabled = false;
}

export function onDisconnect() {
  elements.btnCheckProtection.disabled = true;
  elements.btnRecover.disabled = true;
  elements.recoveryStatusEl.textContent = "";
}
