import { parseNrf52Ficr } from "../nrf/nrf52-ficr.js";

// FICR base address — same across all nRF52 variants and nRF5340
const FICR_PART_ADDR = 0x10000100;
const FICR_BLOCK_LEN = 0x14;

export const TARGETS = [
  {
    id: "nrf52840",
    label: "nRF52840",
    family: "nRF52",
    ficrPart: 0x52840,
    flash: { start: 0x00000000, size: 1024 * 1024, pageSize: 4096 },
    ram: { start: 0x20000000, size: 256 * 1024 },
    uicr: { start: 0x10001000, size: 4096 },
    defaultAppStart: 0x00026000,
    programmer: "nvmc-nrf52",
    hasCtrlAp: true,
    namedRegions: [
      { label: "MBR", start: 0x000000, end: 0x000fff, color: "#6b7280" },
      { label: "BL", start: 0x001000, end: 0x025fff, color: "#9ca3af" }
    ]
  },
  {
    id: "nrf52833",
    label: "nRF52833",
    family: "nRF52",
    ficrPart: 0x52833,
    flash: { start: 0x00000000, size: 512 * 1024, pageSize: 4096 },
    ram: { start: 0x20000000, size: 128 * 1024 },
    uicr: { start: 0x10001000, size: 4096 },
    defaultAppStart: 0x00001000,
    programmer: "nvmc-nrf52",
    hasCtrlAp: true,
    namedRegions: [
      { label: "MBR", start: 0x000000, end: 0x000fff, color: "#6b7280" }
    ]
  },
  {
    id: "nrf52832",
    label: "nRF52832",
    family: "nRF52",
    ficrPart: 0x52832,
    flash: { start: 0x00000000, size: 512 * 1024, pageSize: 4096 },
    ram: { start: 0x20000000, size: 64 * 1024 },
    uicr: { start: 0x10001000, size: 4096 },
    defaultAppStart: 0x00001000,
    programmer: "nvmc-nrf52",
    hasCtrlAp: true,
    namedRegions: [
      { label: "MBR", start: 0x000000, end: 0x000fff, color: "#6b7280" }
    ]
  },
  {
    id: "nrf5340-app",
    label: "nRF5340 (App core)",
    family: "nRF5340",
    ficrPart: 0x5340,
    flash: { start: 0x00000000, size: 1024 * 1024, pageSize: 4096 },
    ram: { start: 0x20000000, size: 512 * 1024 },
    uicr: { start: 0x00ff8000, size: 4096 },
    defaultAppStart: 0x00000000,
    programmer: "unsupported",
    hasCtrlAp: true
  },
  {
    id: "generic",
    label: "Generic (unknown)",
    family: "unknown",
    ficrPart: null,
    flash: { start: 0x00000000, size: 1024 * 1024, pageSize: 4096 },
    ram: { start: 0x20000000, size: 256 * 1024 },
    uicr: { start: 0x10001000, size: 4096 },
    defaultAppStart: 0x00000000,
    programmer: "nvmc-nrf52",
    hasCtrlAp: false
  }
];

export async function detectTarget(adi) {
  let ficr = null;
  try {
    const block = await adi.readMemBlock(FICR_PART_ADDR, FICR_BLOCK_LEN);
    ficr = parseNrf52Ficr(block, 0x00);
    const match = TARGETS.find((t) => t.ficrPart !== null && t.ficrPart === ficr.part);
    if (match) {
      return { target: match, ficr };
    }
  } catch {
    // FICR unreadable — fall through to generic
  }
  return { target: TARGETS.find((t) => t.id === "generic"), ficr };
}
