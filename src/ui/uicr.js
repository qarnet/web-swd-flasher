import { normalizeError } from "../core/errors.js";

const UICR_REGS = [
  { name: "CLENR0",       addr: 0x10001000 },
  { name: "RBPCONF",      addr: 0x10001004 },
  { name: "XTALFREQ",     addr: 0x10001008 },
  { name: "FWID",         addr: 0x10001010 },
  { name: "NRFFW[0]",     addr: 0x10001014 },
  { name: "NRFFW[1]",     addr: 0x10001018 },
  { name: "NRFHW[0]",     addr: 0x10001050 },
  { name: "CUSTOMER[0]",  addr: 0x10001080 },
  { name: "CUSTOMER[1]",  addr: 0x10001084 },
  { name: "CUSTOMER[2]",  addr: 0x10001088 },
  { name: "CUSTOMER[3]",  addr: 0x1000108c },
  { name: "PSELRESET[0]", addr: 0x10001200 },
  { name: "PSELRESET[1]", addr: 0x10001204 },
  { name: "APPROTECT",    addr: 0x10001208 },
  { name: "NFCPINS",      addr: 0x1000120c },
  { name: "DEBUGCTRL",    addr: 0x10001210 },
  { name: "REGOUT0",      addr: 0x10001304 },
];

let elements, logger, connection;

export function init(els, log, conn) {
  elements = els;
  logger = log;
  connection = conn;
}

export async function runUicrRead() {
  const backend = connection.getBackend();
  elements.uicrStatusEl.textContent = "Reading UICR...";
  elements.uicrDumpEl.textContent = "";
  try {
    const lines = [];
    for (const { name, addr } of UICR_REGS) {
      const val = await backend.adi.readMem32(addr);
      lines.push(`${name.padEnd(14)}: 0x${val.toString(16).padStart(8, "0")} (${addr.toString(16).toUpperCase()})`);
    }
    elements.uicrDumpEl.textContent = lines.join("\n");
    elements.uicrDumpEl.hidden = false;
    elements.uicrStatusEl.textContent = "UICR read complete";
    logger.log("UICR read complete");
  } catch (e) {
    elements.uicrStatusEl.textContent = `UICR read failed: ${normalizeError(e).message}`;
  }
}

export function onConnect(backend) {
  elements.btnUicrRead.disabled = false;
}

export function onDisconnect() {
  elements.btnUicrRead.disabled = true;
  elements.uicrStatusEl.textContent = "";
  elements.uicrDumpEl.textContent = "";
  elements.uicrDumpEl.hidden = true;
}
