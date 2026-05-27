export const NRF52840_FLASH_BASE = 0x00000000;
export const NRF52840_FLASH_SIZE = 1024 * 1024;
export const NRF52840_UICR_BASE = 0x10001000;
export const NRF52_DEFAULT_APP_START = 0x00026000;
export const NRF52_DEFAULT_APP_END = NRF52840_FLASH_BASE + NRF52840_FLASH_SIZE - 1;

export function validateAppRange(imageMap) {
  const violations = [];
  for (const segment of imageMap.segments) {
    if (segment.start < NRF52_DEFAULT_APP_START) {
      violations.push(
        `segment starts below allowed app flash at 0x${segment.start.toString(16).padStart(8, "0")}`
      );
    }
    if (segment.end > NRF52_DEFAULT_APP_END) {
      violations.push(
        `segment ends beyond flash limit at 0x${segment.end.toString(16).padStart(8, "0")}`
      );
    }
    if (segment.start >= NRF52840_UICR_BASE) {
      violations.push(
        `segment intersects non-app region at 0x${segment.start.toString(16).padStart(8, "0")}`
      );
    }
  }

  return {
    ok: violations.length === 0,
    violations
  };
}
