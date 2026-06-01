import { normalizeError } from "../core/errors.js";

let elements, logger, connection;

export function init(els, log, conn) {
  elements = els;
  logger = log;
  connection = conn;
}

export async function runCoreHalt() {
  const backend = connection.getBackend();
  elements.debugStatusEl.textContent = "Halting...";
  try {
    await backend.haltCore();
    elements.debugStatusEl.textContent = "Halted";
    logger.log("Core halted");
  } catch (e) {
    elements.debugStatusEl.textContent = `Halt failed: ${normalizeError(e).message}`;
  }
}

export async function runCoreResume() {
  const backend = connection.getBackend();
  elements.debugStatusEl.textContent = "Resuming...";
  try {
    await backend.resumeCore();
    elements.debugStatusEl.textContent = "Running";
    logger.log("Core resumed");
  } catch (e) {
    elements.debugStatusEl.textContent = `Resume failed: ${normalizeError(e).message}`;
  }
}

export async function runCoreStep() {
  const backend = connection.getBackend();
  elements.debugStatusEl.textContent = "Stepping...";
  try {
    await backend.stepCore();
    elements.debugStatusEl.textContent = "Stepped (halted)";
    logger.log("Core stepped");
  } catch (e) {
    elements.debugStatusEl.textContent = `Step failed: ${normalizeError(e).message}`;
  }
}

export async function runCoreRegs() {
  const backend = connection.getBackend();
  elements.debugStatusEl.textContent = "Reading registers...";
  elements.debugRegsEl.textContent = "";
  try {
    const regs = await backend.readCoreRegs();
    const lines = Object.entries(regs).map(([name, val]) =>
      `${name.padEnd(5)}: 0x${val.toString(16).padStart(8, "0")}`
    );
    elements.debugRegsEl.textContent = lines.join("\n");
    elements.debugRegsEl.hidden = false;
    elements.debugStatusEl.textContent = "Registers read";
  } catch (e) {
    elements.debugStatusEl.textContent = `Register read failed: ${normalizeError(e).message}`;
  }
}

export function onConnect(backend) {
  elements.btnCoreHalt.disabled = false;
  elements.btnCoreResume.disabled = false;
  elements.btnCoreStep.disabled = false;
  elements.btnCoreRegs.disabled = false;
}

export function onDisconnect() {
  elements.btnCoreHalt.disabled = true;
  elements.btnCoreResume.disabled = true;
  elements.btnCoreStep.disabled = true;
  elements.btnCoreRegs.disabled = true;
  elements.debugStatusEl.textContent = "";
  elements.debugRegsEl.textContent = "";
  elements.debugRegsEl.hidden = true;
}
