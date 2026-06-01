export class Nrf52FlashProgrammer {
  constructor(progressBus, adiSession) {
    this.progressBus = progressBus;
    this.adi = adiSession;
  }

  static PAGE_SIZE = 4096;
  static NVMC_BASE = 0x4001e000;
  static NVMC_READY = Nrf52FlashProgrammer.NVMC_BASE + 0x400;
  static NVMC_CONFIG = Nrf52FlashProgrammer.NVMC_BASE + 0x504;
  static NVMC_ERASEPAGE = Nrf52FlashProgrammer.NVMC_BASE + 0x508;

  async waitReady(timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ready = await this.adi.readMem32(Nrf52FlashProgrammer.NVMC_READY);
      if ((ready & 1) === 1) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("NVMC waitReady timeout");
  }

  async setConfig(mode) {
    await this.adi.writeMem32(Nrf52FlashProgrammer.NVMC_CONFIG, mode >>> 0);
    await this.waitReady();
  }

  async erasePage(pageAddr) {
    await this.adi.writeMem32(Nrf52FlashProgrammer.NVMC_ERASEPAGE, pageAddr >>> 0);
    await this.waitReady(15000);
  }

  pagesForSegments(segments) {
    const pages = new Set();
    for (const segment of segments) {
      const first = Math.floor(segment.start / Nrf52FlashProgrammer.PAGE_SIZE);
      const last = Math.floor(segment.end / Nrf52FlashProgrammer.PAGE_SIZE);
      for (let p = first; p <= last; p += 1) {
        pages.add(p * Nrf52FlashProgrammer.PAGE_SIZE);
      }
    }
    return [...pages].sort((a, b) => a - b);
  }

  segmentsFromAddresses(addresses) {
    const segments = [];
    if (addresses.length === 0) {
      return segments;
    }
    let start = addresses[0];
    let end = addresses[0];
    for (let i = 1; i < addresses.length; i += 1) {
      const a = addresses[i];
      if (a === end + 1) {
        end = a;
        continue;
      }
      segments.push({ start, end });
      start = a;
      end = a;
    }
    segments.push({ start, end });
    return segments;
  }

  buildWordArray(image, startAddr, endAddr) {
    const wordCount = Math.ceil((endAddr - startAddr + 1) / 4);
    const words = new Uint32Array(wordCount);
    for (let i = 0; i < wordCount; i += 1) {
      const addr = startAddr + i * 4;
      const b0 = image.data.get(addr) ?? 0xff;
      const b1 = image.data.get(addr + 1) ?? 0xff;
      const b2 = image.data.get(addr + 2) ?? 0xff;
      const b3 = image.data.get(addr + 3) ?? 0xff;
      words[i] = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
    }
    return words;
  }

  async programImage(image) {
    const segments = this.segmentsFromAddresses(image.addresses);
    const transport = this.adi.dapCore?.transport ?? null;
    const origLog = transport?.log ?? null;
    if (transport) transport.log = null;

    try {
      this.progressBus.emit({ type: "program", percent: 5, message: "CMSIS-DAP NVMC prepare" });
      await this.setConfig(2);

      const pages = this.pagesForSegments(segments);
      for (let i = 0; i < pages.length; i += 1) {
        await this.erasePage(pages[i]);
        const percent = 5 + Math.floor(((i + 1) / Math.max(1, pages.length)) * 35);
        this.progressBus.emit({ type: "program", percent, message: `Erased page 0x${pages[i].toString(16)}` });
      }

      await this.setConfig(1);

      const totalWords = segments.reduce((sum, seg) => sum + Math.ceil((seg.end - seg.start + 1) / 4), 0);
      let writtenWords = 0;

      for (const seg of segments) {
        const segWordCount = Math.ceil((seg.end - seg.start + 1) / 4);
        const wordsBeforeSeg = writtenWords;
        const words = this.buildWordArray(image, seg.start, seg.end);
        await this.adi.writeMemBlockFast(seg.start, words, 0, segWordCount, (doneInSeg) => {
          const total = wordsBeforeSeg + doneInSeg;
          const percent = 40 + Math.floor((total / Math.max(1, totalWords)) * 55);
          this.progressBus.emit({ type: "program", percent, message: `Programmed ${total}/${totalWords} words` });
        });
        writtenWords += segWordCount;
      }

      await this.waitReady();
      await this.setConfig(0);
      this.progressBus.emit({ type: "program", percent: 100, message: `CMSIS-DAP programmed ${image.byteCount} bytes` });
    } finally {
      if (transport) transport.log = origLog;
    }
  }

  async verifyImage(image) {
    const segments = this.segmentsFromAddresses(image.addresses);
    const totalWords = segments.reduce((sum, seg) => sum + Math.ceil((seg.end - seg.start + 1) / 4), 0);
    const useBlockRead = typeof this.adi.readMemBlockFast === "function";
    let checked = 0;

    const transport = this.adi.dapCore?.transport ?? null;
    const origLog = transport?.log ?? null;
    if (transport) transport.log = null;

    try {

    for (const seg of segments) {
      const segWordCount = Math.ceil((seg.end - seg.start + 1) / 4);

      if (useBlockRead) {
        const maxReadWords = this.adi.maxReadBlockWordCount;
        let offset = 0;
        while (offset < segWordCount) {
          const count = Math.min(maxReadWords, segWordCount - offset);
          const readback = await this.adi.readMemBlockFast(seg.start + offset * 4, count);
          const baseAddr = seg.start + offset * 4;
          for (let j = 0; j < count; j += 1) {
            const addr = baseAddr + j * 4;
            const b0 = image.data.get(addr) ?? 0xff;
            const b1 = image.data.get(addr + 1) ?? 0xff;
            const b2 = image.data.get(addr + 2) ?? 0xff;
            const b3 = image.data.get(addr + 3) ?? 0xff;
            const expected = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
            if (readback[j] !== expected) {
              throw new Error(
                `Verify mismatch at 0x${addr.toString(16)}: got 0x${readback[j].toString(16)}, expected 0x${expected.toString(16)}`
              );
            }
          }
          checked += count;
          offset += count;
          if (checked % 256 === 0 || checked === totalWords) {
            const percent = Math.floor((checked / Math.max(1, totalWords)) * 100);
            this.progressBus.emit({ type: "verify", percent, message: `Verified ${checked}/${totalWords} words` });
          }
        }
      } else {
        let currentAddr = seg.start;
        while (currentAddr <= seg.end) {
          const read = await this.adi.readMem32(currentAddr);
          const b0 = image.data.get(currentAddr) ?? 0xff;
          const b1 = image.data.get(currentAddr + 1) ?? 0xff;
          const b2 = image.data.get(currentAddr + 2) ?? 0xff;
          const b3 = image.data.get(currentAddr + 3) ?? 0xff;
          const expected = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
          if (read !== expected) {
            throw new Error(
              `Verify mismatch at 0x${currentAddr.toString(16)}: got 0x${read.toString(16)}, expected 0x${expected.toString(16)}`
            );
          }
          checked += 1;
          currentAddr += 4;
          if (checked % 128 === 0 || checked === totalWords) {
            const percent = Math.floor((checked / Math.max(1, totalWords)) * 100);
            this.progressBus.emit({ type: "verify", percent, message: `Verified ${checked}/${totalWords} words` });
          }
        }
      }
    }
    this.progressBus.emit({ type: "verify", percent: 100, message: "CMSIS-DAP verify complete" });

    } finally {
      if (transport) transport.log = origLog;
    }
  }
}