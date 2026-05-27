function readU32(data, offset) {
  if (offset + 4 > data.length) {
    throw new Error("FICR read out of range");
  }
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    (data[offset + 3] << 24)
  ) >>> 0;
}

export function parseNrf52Ficr(snapshot) {
  return {
    part: readU32(snapshot, 0x100),
    variant: readU32(snapshot, 0x104),
    package: readU32(snapshot, 0x108),
    ram: readU32(snapshot, 0x10c),
    flash: readU32(snapshot, 0x110)
  };
}

export function formatFicrInfo(info) {
  return [
    `PART=0x${info.part.toString(16)}`,
    `VARIANT=0x${info.variant.toString(16)}`,
    `PACKAGE=0x${info.package.toString(16)}`,
    `RAM=0x${info.ram.toString(16)}`,
    `FLASH=0x${info.flash.toString(16)}`
  ].join(" ");
}
