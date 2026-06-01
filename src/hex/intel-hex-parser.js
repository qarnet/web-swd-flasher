function hexByte(text, offset) {
  return Number.parseInt(text.slice(offset, offset + 2), 16);
}

function computeChecksum(bytes) {
  let sum = 0;
  for (const value of bytes) {
    sum = (sum + value) & 0xff;
  }
  return ((~sum + 1) & 0xff) >>> 0;
}

export function parseIntelHex(content) {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const data = new Map();
  let upperAddress = 0;
  let eofSeen = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const raw = lines[lineIndex].trim();
    if (raw.length === 0) {
      continue;
    }
    if (!raw.startsWith(":")) {
      throw new Error(`Line ${lineIndex + 1}: missing ':' prefix`);
    }
    if ((raw.length - 1) % 2 !== 0) {
      throw new Error(`Line ${lineIndex + 1}: odd hex payload length`);
    }

    const bytes = [];
    for (let i = 1; i < raw.length; i += 2) {
      const byte = Number.parseInt(raw.slice(i, i + 2), 16);
      if (Number.isNaN(byte)) {
        throw new Error(`Line ${lineIndex + 1}: invalid hex digit`);
      }
      bytes.push(byte);
    }

    const length = bytes[0];
    const address = (bytes[1] << 8) | bytes[2];
    const recordType = bytes[3];
    const recordData = bytes.slice(4, 4 + length);
    const checksum = bytes[4 + length];

    if (bytes.length !== 5 + length) {
      throw new Error(`Line ${lineIndex + 1}: record length mismatch`);
    }

    const expectedChecksum = computeChecksum(bytes.slice(0, 4 + length));
    if (checksum !== expectedChecksum) {
      throw new Error(
        `Line ${lineIndex + 1}: checksum mismatch (got 0x${checksum.toString(16).padStart(2, "0")}, expected 0x${expectedChecksum.toString(16).padStart(2, "0")})`
      );
    }

    if (recordType === 0x00) {
      for (let i = 0; i < recordData.length; i += 1) {
        const absolute = upperAddress + address + i;
        data.set(absolute >>> 0, recordData[i]);
      }
    } else if (recordType === 0x01) {
      eofSeen = true;
      break;
    } else if (recordType === 0x04) {
      if (recordData.length !== 2) {
        throw new Error(`Line ${lineIndex + 1}: invalid extended linear address record`);
      }
      upperAddress = ((recordData[0] << 8) | recordData[1]) << 16;
    } else if (recordType === 0x02) {
      if (recordData.length !== 2) {
        throw new Error(`Line ${lineIndex + 1}: invalid extended segment address record`);
      }
      upperAddress = ((recordData[0] << 8) | recordData[1]) << 4;
    } else if (recordType === 0x03 || recordType === 0x05) {
      continue;
    } else {
      throw new Error(`Line ${lineIndex + 1}: unsupported record type 0x${recordType.toString(16)}`);
    }
  }

  if (!eofSeen) {
    throw new Error("Missing end-of-file record");
  }

  if (data.size === 0) {
    throw new Error("No data records found");
  }

  const addresses = [...data.keys()].sort((a, b) => a - b);
  const minAddress = addresses[0];
  const maxAddress = addresses[addresses.length - 1];

  return {
    format: "intel-hex",
    byteCount: data.size,
    minAddress,
    maxAddress,
    data,
    addresses
  };
}

export function parseIntelHexFileText(text) {
  return parseIntelHex(text);
}

export function parseIntelHexLineHeader(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith(":")) {
    throw new Error("invalid line");
  }
  return {
    length: hexByte(trimmed, 1),
    address: (hexByte(trimmed, 3) << 8) | hexByte(trimmed, 5),
    recordType: hexByte(trimmed, 7)
  };
}
