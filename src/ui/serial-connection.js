import * as serialLogger from "./serial-logger.js";

let elements, serialManager;
let onSerialConnected = null;

export function setOnSerialConnected(fn) {
  onSerialConnected = fn;
}

export function init(els, manager) {
  elements = els;
  serialManager = manager;
  const savedBaud = localStorage.getItem("serial-baud");
  if (savedBaud !== null) elements.serialBaudSelect.value = savedBaud;
  elements.serialBaudSelect.addEventListener("change", () => {
    localStorage.setItem("serial-baud", elements.serialBaudSelect.value);
  });
}

export function checkCompatibility() {
  if (!serialManager.constructor.supported) {
    elements.serialCompatBanner.hidden = false;
    elements.serialCompatMsg.textContent = "Web Serial API not available in this browser. Use Chrome 89+ or Edge 89+.";
    elements.btnSerialConnect.disabled = true;
    return false;
  }
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    elements.serialCompatBanner.hidden = false;
    elements.serialCompatMsg.textContent = "Web Serial requires HTTPS. Serve over HTTPS or localhost.";
    elements.btnSerialConnect.disabled = true;
    return false;
  }
  return true;
}

export async function connectSerial() {
  try {
    const info = await serialManager.requestPort();
    elements.serialStatusEl.textContent = `Selected: VID 0x${(info.usbVendorId ?? 0).toString(16)} PID 0x${(info.usbProductId ?? 0).toString(16)}`;
    const baudRate = parseInt(elements.serialBaudSelect.value, 10) || 115200;
    await serialManager.connect({ baudRate });
    onSerialConnected?.();
    elements.serialStatusEl.textContent = `Connected at ${baudRate} baud`;
    elements.btnSerialConnect.disabled = true;
    elements.btnSerialDisconnect.disabled = false;
    elements.serialBaudSelect.disabled = true;
    serialLogger.log(`Serial connected at ${baudRate} baud`);
  } catch (err) {
    if (err.name === "NotFoundError") {
      elements.serialStatusEl.textContent = "No port selected";
    } else {
      elements.serialStatusEl.textContent = `Connection failed: ${err.message}`;
      serialLogger.log(`Serial connection failed: ${err.message}`);
    }
  }
}

export async function disconnectSerial() {
  try {
    await serialManager.disconnect();
  } catch { /* ignore */ }
  elements.serialStatusEl.textContent = "Disconnected";
  elements.btnSerialConnect.disabled = false;
  elements.btnSerialDisconnect.disabled = true;
  elements.serialBaudSelect.disabled = false;
  serialLogger.log("Serial disconnected");
}

export function onSerialDisconnect() {
  elements.serialStatusEl.textContent = "Port disconnected";
  elements.btnSerialConnect.disabled = false;
  elements.btnSerialDisconnect.disabled = true;
  elements.serialBaudSelect.disabled = false;
  serialLogger.log("Serial port disconnected unexpectedly");
}