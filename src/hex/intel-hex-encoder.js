export function buildIntelHex(addr, bytes) {
  const lines = [];
  const hb = (v) => v.toString(16).padStart(2, "0").toUpperCase();
  const record = (type, address, data) => {
    const len = data.length;
    let sum = len + type + ((address >> 8) & 0xff) + (address & 0xff);
    for (const b of data) sum += b;
    const cs = ((~sum + 1) & 0xff);
    return `:${hb(len)}${address.toString(16).padStart(4, "0").toUpperCase()}${hb(type)}${data.map(hb).join("")}${hb(cs)}`;
  };

  let segBase = -1;
  let offset = 0;
  while (offset < bytes.length) {
    const absAddr = addr + offset;
    const sb = absAddr >>> 16;
    if (sb !== segBase) {
      segBase = sb;
      lines.push(record(4, 0, [(sb >> 8) & 0xff, sb & 0xff]));
    }
    const chunkSize = Math.min(16, bytes.length - offset);
    lines.push(record(0, absAddr & 0xffff, Array.from(bytes.slice(offset, offset + chunkSize))));
    offset += chunkSize;
  }
  lines.push(":00000001FF");
  return lines.join("\r\n") + "\r\n";
}
