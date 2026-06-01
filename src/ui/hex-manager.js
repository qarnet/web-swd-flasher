import { mergeHexFiles, FILE_COLORS } from "../hex/multi-hex-merger.js";
import { parseIntelHexFileText } from "../hex/intel-hex-parser.js";
import { buildImageMap, formatImageMap } from "../hex/image-map.js";
import { validateAppRange } from "../nrf/nrf52-memory-map.js";

let elements, logger, connection;
let hexFiles = [];
let nextFileId = 0;
let imageContext = null;
let onImageChangeCallback;

export function init(els, log, conn) {
  elements = els;
  logger = log;
  connection = conn;
}

export function setOnImageChangeCallback(fn) {
  onImageChangeCallback = fn;
}

export function getImageContext() {
  return imageContext;
}

export function getHexFiles() {
  return hexFiles;
}

function getActiveTarget() {
  const backend = connection.getBackend();
  return connection.isConnected() ? backend.activeTarget : null;
}

function mergeAndUpdate() {
  if (hexFiles.length === 0) {
    imageContext = null;
    elements.imageSummary.textContent = "No image loaded";
    elements.imageMapEl.textContent = "";
    elements.imageMapEl.hidden = true;
    if (onImageChangeCallback) onImageChangeCallback();
    return;
  }

  const mode = elements.flashModeSelect.value;
  const { conflicts, merged } = mergeHexFiles(hexFiles);

  if (conflicts.length > 0) {
    for (const c of conflicts) {
      logger.log(`Conflict at 0x${c.addr.toString(16)}: ${c.fileA}=0x${c.valueA.toString(16)} vs ${c.fileB}=0x${c.valueB.toString(16)}`);
    }
    elements.imageSummary.textContent = `⚠ ${conflicts.length} address conflict(s) between loaded files.`;
    imageContext = null;
    elements.imageMapEl.textContent = "";
    elements.imageMapEl.hidden = true;
    if (onImageChangeCallback) onImageChangeCallback();
    return;
  }

  if (!merged) {
    imageContext = null;
    elements.imageSummary.textContent = "No data after merge";
    elements.imageMapEl.hidden = true;
    if (onImageChangeCallback) onImageChangeCallback();
    return;
  }

  const map = buildImageMap(merged);
  const policy = validateAppRange(map, mode, getActiveTarget());
  imageContext = { parsed: merged, map, policy, mode };
  elements.imageMapEl.textContent = formatImageMap(map);
  elements.imageMapEl.hidden = false;

  if (policy.ok) {
    const names = hexFiles.map((f) => f.name).join(", ");
    elements.imageSummary.textContent = `${merged.byteCount} bytes from ${hexFiles.length} file(s) — OK (mode: ${mode})`;
    logger.log(`Image accepted: ${names} (mode: ${mode})`);
  } else {
    elements.imageSummary.textContent = "Image rejected by range policy.";
    for (const issue of policy.violations) {
      logger.log(`Policy violation: ${issue}`);
    }
  }
  if (onImageChangeCallback) onImageChangeCallback();
}

function addHexFromText(name, text) {
  try {
    const parsed = parseIntelHexFileText(text);
    const color = FILE_COLORS[nextFileId % FILE_COLORS.length];
    hexFiles.push({ id: nextFileId++, name, parsed, color });
    renderFileList();
    mergeAndUpdate();
  } catch (error) {
    logger.log(`Parse failed (${name}): ${error.message}`);
  }
}

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderFileList() {
  if (hexFiles.length === 0) {
    elements.fileListEl.innerHTML = "";
    return;
  }
  const items = hexFiles.map((f) => {
    const segs = buildImageMap(f.parsed).segments.length;
    return `<div class="file-item flex-center gap-sm my-1">
      <span class="w-3 h-3 rounded-sm flex-shrink-0" style="background:${f.color};"></span>
      <span class="flex-1 text-sm">${escHtml(f.name)} <small class="text-muted">(${f.parsed.byteCount}B, ${segs} seg)</small></span>
      <button type="button" data-remove-id="${f.id}" class="text-xs px-1 py-1">✕</button>
    </div>`;
  }).join("");
  elements.fileListEl.innerHTML = items;
  elements.fileListEl.querySelectorAll("[data-remove-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.removeId, 10);
      hexFiles = hexFiles.filter((f) => f.id !== id);
      renderFileList();
      mergeAndUpdate();
    });
  });
}

export async function onFetchHex() {
  const url = elements.urlInput.value.trim();
  if (!url) return;
  logger.setStatus("Fetching hex…");
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const name = url.split("/").pop() || url;
    addHexFromText(name, text);
    logger.setStatus("Ready");
  } catch (error) {
    logger.log(`Fetch failed: ${error.message}`);
    logger.setStatus("Ready");
  }
}

export async function onLoadBuiltin() {
  const url = elements.builtinSelect.value;
  if (!url) {
    logger.setStatus("Select a firmware variant first");
    return;
  }
  const name = elements.builtinSelect.options[elements.builtinSelect.selectedIndex].textContent;
  logger.setStatus(`Loading ${name}…`);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    addHexFromText(`${name}.hex`, text);
    logger.setStatus("Ready");
  } catch (error) {
    logger.log(`Built-in load failed: ${error.message}`);
    logger.setStatus("Ready");
  }
}

export async function onFirmwareSelected(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  for (const file of files) {
    try {
      const text = await file.text();
      addHexFromText(file.name, text);
    } catch (error) {
      logger.log(`File read failed (${file.name}): ${error.message}`);
    }
  }
  event.target.value = "";
}

export function onClearHex() {
  hexFiles = [];
  renderFileList();
  mergeAndUpdate();
}

export function onConnect(backend) {
  mergeAndUpdate();
}

export function onDisconnect() {
  mergeAndUpdate();
}
