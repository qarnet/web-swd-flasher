// SEGGER RTT control block magic: "SEGGER RTT\0\0\0\0\0\0" (16 bytes)
const RTT_MAGIC = [0x53, 0x45, 0x47, 0x47, 0x45, 0x52, 0x20, 0x52, 0x54, 0x54, 0, 0, 0, 0, 0, 0];
const CB_MAGIC_OFF = 0;    // +0x00: 16-byte magic
const CB_UP_COUNT_OFF = 16; // +0x10: MaxNumUpBuffers (u32)
const CB_DOWN_COUNT_OFF = 20; // +0x14: MaxNumDownBuffers (u32)
const CB_HEADER_SIZE = 24;
const CHAN_DESC_SIZE = 24;  // each channel descriptor: 6 fields × 4 bytes
// Channel descriptor offsets:
const CHAN_PNAME = 0;       // pointer to name string
const CHAN_PBUF = 4;        // pointer to ring buffer
const CHAN_SIZE = 8;        // SizeOfBuffer
const CHAN_WROFF = 12;      // WrOff (written by target)
const CHAN_RDOFF = 16;      // RdOff (written by host)
const CHAN_FLAGS = 20;      // Flags

function magicMatch(words, wordOffset) {
  // Check 16 bytes at byte offset wordOffset*4 in the words array
  const bytes = new Uint8Array(new Uint32Array([
    words[wordOffset], words[wordOffset + 1], words[wordOffset + 2], words[wordOffset + 3]
  ]).buffer);
  for (let i = 0; i < 16; i++) {
    if (bytes[i] !== RTT_MAGIC[i]) return false;
  }
  return true;
}

export class RttClient {
  constructor(adi) {
    this.adi = adi;
    this._cbAddr = null;
    this._upChannels = [];
    this._downChannels = [];
    this._pollTimer = null;
    this._running = false;
    this._handlers = { data: [], "channel-found": [], error: [] };
  }

  on(event, fn) {
    if (this._handlers[event]) this._handlers[event].push(fn);
    return this;
  }

  off(event, fn) {
    if (this._handlers[event]) {
      this._handlers[event] = this._handlers[event].filter((h) => h !== fn);
    }
    return this;
  }

  removeAllListeners() {
    for (const key of Object.keys(this._handlers)) {
      this._handlers[key] = [];
    }
    return this;
  }

  _emit(event, data) {
    for (const h of this._handlers[event] ?? []) {
      try { h(data); } catch { /* ignore handler errors */ }
    }
  }

  // Search for the RTT control block in RAM.
  // ramStart: start address (e.g. 0x20000000), ramSize: bytes to search.
  // Returns true if found.
  async search(ramStart, ramSize) {
    this._cbAddr = null;
    this._upChannels = [];
    this._downChannels = [];

    const SCAN_BLOCK = 256; // words per scan chunk
    const totalWords = Math.ceil(ramSize / 4);
    let offset = 0;

    while (offset < totalWords) {
      const count = Math.min(SCAN_BLOCK, totalWords - offset);
      let words;
      try {
        words = await this.adi.readMemBlockFast(ramStart + offset * 4, count);
      } catch {
        offset += count;
        continue;
      }
      // Scan word-aligned positions for magic
      for (let i = 0; i <= words.length - 4; i++) {
        if (magicMatch(words, i)) {
          const candidateAddr = ramStart + (offset + i) * 4;
          if (await this._validateAndLoad(candidateAddr)) {
            this._cbAddr = candidateAddr;
            this._emit("channel-found", {
              addr: candidateAddr,
              upChannels: this._upChannels.length,
              downChannels: this._downChannels.length
            });
            return true;
          }
        }
      }
      offset += count;
    }
    return false;
  }

  async _validateAndLoad(cbAddr) {
    try {
      const headerWords = await this.adi.readMemBlockFast(cbAddr, Math.ceil(CB_HEADER_SIZE / 4));
      const hBytes = new Uint8Array(headerWords.buffer);
      const view = new DataView(hBytes.buffer);
      const upCount = view.getUint32(CB_UP_COUNT_OFF, true);
      const downCount = view.getUint32(CB_DOWN_COUNT_OFF, true);
      if (upCount === 0 || upCount > 32 || downCount > 32) return false;

      const chanTotalWords = Math.ceil(((upCount + downCount) * CHAN_DESC_SIZE) / 4);
      const chanWords = await this.adi.readMemBlockFast(cbAddr + CB_HEADER_SIZE, chanTotalWords);
      const chanBytes = new Uint8Array(chanWords.buffer);
      const cv = new DataView(chanBytes.buffer);

      const parseChans = (count, startOff) => {
        const chans = [];
        for (let i = 0; i < count; i++) {
          const o = startOff + i * CHAN_DESC_SIZE;
          chans.push({
            pName: cv.getUint32(o + CHAN_PNAME, true),
            pBuffer: cv.getUint32(o + CHAN_PBUF, true),
            size: cv.getUint32(o + CHAN_SIZE, true),
            wrOff: cv.getUint32(o + CHAN_WROFF, true),
            rdOff: cv.getUint32(o + CHAN_RDOFF, true),
            flags: cv.getUint32(o + CHAN_FLAGS, true)
          });
        }
        return chans;
      };

      this._upChannels = parseChans(upCount, 0);
      this._downChannels = parseChans(downCount, upCount * CHAN_DESC_SIZE);
      return true;
    } catch {
      return false;
    }
  }

  // Start polling the up (target→host) channels.
  // cbAddr: control block address (from a previous search, or pass directly).
  // intervalMs: polling interval in ms (default 50).
  startPolling(intervalMs = 50) {
    if (this._running) return;
    if (!this._cbAddr) throw new Error("RTT: no control block found — run search() first");
    this._running = true;
    this._schedulePoll(intervalMs);
  }

  _schedulePoll(intervalMs) {
    if (!this._running) return;
    this._pollTimer = setTimeout(async () => {
      try {
        await this._poll();
      } catch (err) {
        this._emit("error", err);
      }
      this._schedulePoll(intervalMs);
    }, intervalMs);
  }

  async _poll() {
    const cbAddr = this._cbAddr;
    const upCount = this._upChannels.length;
    if (upCount === 0) return;

    for (let ch = 0; ch < upCount; ch++) {
      const chanDescAddr = cbAddr + CB_HEADER_SIZE + ch * CHAN_DESC_SIZE;
      const ptrWords = await this.adi.readMemBlockFast(chanDescAddr + CHAN_WROFF, 2);
      const wrOff = ptrWords[0];
      const rdOff = ptrWords[1];
      const { pBuffer, size } = this._upChannels[ch];

      if (wrOff === rdOff || size === 0 || pBuffer === 0) continue;

      let data;
      if (wrOff > rdOff) {
        data = await this._readRingBytes(pBuffer, size, rdOff, wrOff - rdOff);
      } else {
        const part1Len = size - rdOff;
        const part2Len = wrOff;
        const b1 = await this._readRingBytes(pBuffer, size, rdOff, part1Len);
        const b2 = part2Len > 0 ? await this._readRingBytes(pBuffer, size, 0, part2Len) : new Uint8Array(0);
        data = new Uint8Array(b1.length + b2.length);
        data.set(b1, 0);
        data.set(b2, b1.length);
      }

      const newRdOff = wrOff;
      await this.adi.writeMem32(chanDescAddr + CHAN_RDOFF, newRdOff);
      this._upChannels[ch].wrOff = wrOff;
      this._upChannels[ch].rdOff = newRdOff;

      this._emit("data", { channel: ch, data });
    }
  }

  async _readRingBytes(pBuffer, ringSize, offset, byteCount) {
    const alignAddr = (pBuffer + offset) & ~3;
    const byteOffset = (pBuffer + offset) - alignAddr;
    const totalBytes = byteOffset + byteCount;
    const wordCount = Math.ceil(totalBytes / 4);
    const words = await this.adi.readMemBlockFast(alignAddr, wordCount);
    const view = new Uint8Array(words.buffer, words.byteOffset, words.byteLength);
    return view.slice(byteOffset, byteOffset + byteCount);
  }

  stop() {
    this._running = false;
    if (this._pollTimer !== null) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
  }

  // Write data to a down channel (host→target).
  async write(channel, data) {
    if (!this._cbAddr) throw new Error("RTT: not initialized");
    const ch = this._downChannels[channel];
    if (!ch) throw new Error(`RTT: no down channel ${channel}`);
    const { pBuffer, size } = ch;
    if (size === 0 || pBuffer === 0) throw new Error("RTT: down channel not initialized by target");

    const descAddr = this._cbAddr + CB_HEADER_SIZE + (this._upChannels.length + channel) * CHAN_DESC_SIZE;
    const ptrWords = await this.adi.readMemBlockFast(descAddr + CHAN_WROFF, 2);
    const wrOff = ptrWords[0];
    const rdOff = ptrWords[1];
    const free = wrOff >= rdOff ? (size - 1) - (wrOff - rdOff) : (rdOff - wrOff - 1);
    if (data.length > free) throw new Error(`RTT: down channel ${channel} full (${free}B free)`);

    for (let i = 0; i < data.length; i++) {
      await this.adi.writeMem32(pBuffer + ((wrOff + i) % size), data[i]);
    }
    await this.adi.writeMem32(descAddr + CHAN_WROFF, (wrOff + data.length) % size);
  }

  get controlBlockAddr() {
    return this._cbAddr;
  }
}
