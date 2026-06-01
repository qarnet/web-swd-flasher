export function makeImage(addressByteMap) {
  const data = new Map();
  const addresses = [];

  if (addressByteMap instanceof Map) {
    for (const [addr, val] of addressByteMap) {
      data.set(addr, val);
      addresses.push(addr);
    }
  } else {
    for (const [addr, val] of Object.entries(addressByteMap)) {
      const a = Number(addr);
      data.set(a, val);
      addresses.push(a);
    }
  }

  addresses.sort((a, b) => a - b);
  const byteCount = addresses.length;

  return { byteCount, addresses, data };
}

export function makeContiguousImage(startAddr, bytes) {
  const data = new Map();
  const addresses = [];
  for (let i = 0; i < bytes.length; i++) {
    data.set(startAddr + i, bytes[i]);
    addresses.push(startAddr + i);
  }
  return { byteCount: bytes.length, addresses, data };
}

export function makeWordImage(startAddr, words) {
  const data = new Map();
  const addresses = [];
  for (let i = 0; i < words.length; i++) {
    const addr = startAddr + i * 4;
    const w = words[i] >>> 0;
    data.set(addr, w & 0xff);
    data.set(addr + 1, (w >>> 8) & 0xff);
    data.set(addr + 2, (w >>> 16) & 0xff);
    data.set(addr + 3, (w >>> 24) & 0xff);
    addresses.push(addr, addr + 1, addr + 2, addr + 3);
  }
  return { byteCount: words.length * 4, addresses, data };
}

export function makePageImage(startAddr, pageSize = 4096, fillByte = 0xff) {
  const data = new Map();
  const addresses = [];
  for (let i = 0; i < pageSize; i++) {
    data.set(startAddr + i, fillByte);
    addresses.push(startAddr + i);
  }
  return { byteCount: pageSize, addresses, data };
}