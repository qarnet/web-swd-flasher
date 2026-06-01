export const NRF52840_FLASH_BASE = 0x00000000;
export const NRF52840_FLASH_SIZE = 1024 * 1024;
export const NRF52840_UICR_BASE = 0x10001000;
export const NRF52_DEFAULT_APP_START = 0x00026000;
export const NRF52_DEFAULT_APP_END = NRF52840_FLASH_BASE + NRF52840_FLASH_SIZE - 1;

// Default bounds for nRF52840 (used when no target descriptor is provided)
const DEFAULT_BOUNDS = {
  flashStart: NRF52840_FLASH_BASE,
  flashEnd: NRF52_DEFAULT_APP_END,
  uicrBase: NRF52840_UICR_BASE,
  appStart: NRF52_DEFAULT_APP_START
};

export function validateAppRange(imageMap, mode = "app-only", targetDescriptor = null) {
  const bounds = targetDescriptor
    ? {
        flashStart: targetDescriptor.flash.start,
        flashEnd: targetDescriptor.flash.start + targetDescriptor.flash.size - 1,
        uicrBase: targetDescriptor.uicr.start,
        appStart: targetDescriptor.defaultAppStart
      }
    : DEFAULT_BOUNDS;

  const violations = [];
  const allowStart = mode === "full-flash" ? bounds.flashStart : bounds.appStart;

  for (const segment of imageMap.segments) {
    // In full-flash mode, allow writes to bootloader and UICR regions
    const isUicrSegment = segment.start >= bounds.uicrBase && segment.start < bounds.uicrBase + 0x1000;
    const isBootloaderSegment = segment.start < bounds.appStart;

    if (!isUicrSegment && segment.start < allowStart) {
      violations.push(
        `segment starts below allowed flash at 0x${segment.start.toString(16).padStart(8, "0")}`
      );
    }
    if (segment.end > bounds.uicrBase && !isUicrSegment) {
      violations.push(
        `segment ends beyond flash limit at 0x${segment.end.toString(16).padStart(8, "0")}`
      );
    }
    // Only reject UICR writes in app-only mode, allow in full-flash mode
    if (isUicrSegment && mode !== "full-flash") {
      violations.push(
        `segment intersects UICR at 0x${segment.start.toString(16).padStart(8, "0")}`
      );
    }
  }

  return {
    ok: violations.length === 0,
    violations
  };
}
