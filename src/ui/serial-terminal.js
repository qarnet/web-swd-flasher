import { AnsiRenderer } from "./ansi-renderer.js";
import { downloadLog, autoScrollObserver } from "./log-panel-helpers.js";
import * as serialLogger from "./serial-logger.js";
import * as serialConnection from "./serial-connection.js";

let elements, serialManager;
let ansiRenderer = null;
let firstChunk = true;
let skipBuf = "";

export function init(els, manager) {
  elements = els;
  serialManager = manager;
  ansiRenderer = new AnsiRenderer();
  firstChunk = true;
  skipBuf = "";
  autoScrollObserver(elements.serialTermLogEl, elements.chkSerialAutoScroll);

  serialManager.onData = (bytes) => {
    let text = new TextDecoder().decode(bytes);
    if (firstChunk) {
      skipBuf += text;
      const nl = skipBuf.indexOf("\n");
      if (nl === -1) return;
      firstChunk = false;
      text = skipBuf.slice(nl + 1);
      skipBuf = "";
      if (!text) return;
    }
    ansiRenderer.write(elements.serialTermLogEl, text);
  };

  serialConnection.setOnSerialConnected(() => {
    firstChunk = true;
    skipBuf = "";
  });

  navigator.serial?.addEventListener("disconnect", (e) => {
    if (serialManager._uart?._port === e.target) {
      serialConnection.onSerialDisconnect();
    }
  });
}

export function sendSerialData() {
  const text = elements.serialTxInput.value;
  if (!text || !serialManager.connected) return;
  serialManager.send(new TextEncoder().encode(text + "\r\n"))
    .then(() => { elements.serialTxInput.value = ""; })
    .catch(err => { serialLogger.log(`Serial send failed: ${err.message}`); });
}

export function clearSerialLog() {
  elements.serialTermLogEl.textContent = "";
  ansiRenderer.reset();
  firstChunk = true;
  skipBuf = "";
}

export function downloadSerialLog() {
  downloadLog(ansiRenderer.plainText, `serial-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
}