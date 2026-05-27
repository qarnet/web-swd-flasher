const VENDOR_FILTERS = [{ vendorId: 0x1366 }, { vendorId: 0x0d28 }];

const compatBanner = document.getElementById("compat-banner");
const compatMsg = document.getElementById("compat-msg");
const btnConnect = document.getElementById("btn-connect");
const btnDisconnect = document.getElementById("btn-disconnect");
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");

let activeDevice = null;

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
    setStatus("Opening USB device chooser...");
    const device = await navigator.usb.requestDevice({ filters: VENDOR_FILTERS });
    await device.open();
    activeDevice = device;
    setConnected(true);
    setStatus(
      `Connected: ${device.manufacturerName || "unknown"} ${device.productName || "device"} (${device.vendorId.toString(16)}:${device.productId.toString(16)})`
    );
  } catch (error) {
    setStatus(`Connect failed: ${error.message}`);
  }
}

async function disconnectProbe() {
  if (!activeDevice) {
    return;
  }
  try {
    await activeDevice.close();
  } catch (error) {
    log(`Close warning: ${error.message}`);
  }
  activeDevice = null;
  setConnected(false);
  setStatus("Disconnected");
}

btnConnect.addEventListener("click", connectProbe);
btnDisconnect.addEventListener("click", disconnectProbe);

if (checkCompatibility()) {
  setStatus("Ready");
}
