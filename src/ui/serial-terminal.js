import { AnsiRenderer } from "./ansi-renderer.js";
import { downloadLog, autoScrollObserver } from "./log-panel-helpers.js";
import * as serialLogger from "./serial-logger.js";

let elements, serialManager;
let ansiRenderer = null;
let firstChunk = true;

export function init(els, manager) {
  elements = els;
  serialManager = manager;
  ansiRenderer = new AnsiRenderer();
  firstChunk = true;
  autoScrollObserver(elements.serialTermLogEl, elements.chkSerialAutoScroll);

  serialManager.onData = (bytes) => {
    const text = new TextDecoder().decode(bytes);
    if (firstChunk) {
      firstChunk = false;
      ansiRenderer.write(elements.serialTermLogEl, "\n");
    }
    ansiRenderer.write(elements.serialTermLogEl, text);
  };

  navigator.serial?.addEventListener("disconnect", (e) => {
    if (serialManager._uart?._port === e.target) {
      import("./serial-connection.js").then(m => m.onSerialDisconnect());
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
}

export function resetFirstChunk() {
  firstChunk = true;
}

export function downloadSerialLog() {
  downloadLog(ansiRenderer.plainText, `serial-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
}