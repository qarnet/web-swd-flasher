# web-swd-flasher — Feature Plan

## Hardware Context

**Probe**: Raspberry Pi Pico 2 (RP2350) running picoprobe firmware.

Pin assignments (picoprobe on Pico):

| Signal  | Pico GPIO |
|---------|-----------|
| SWCLK   | 2         |
| SWDIO   | 3         |
| nRESET  | 1 (optional, requires PROBE_PIN_RESET in firmware) |
| UART TX | 4         |
| UART RX | 5         |

**SWO**: NOT supported. RP2040/RP2350 lacks SWO hardware entirely. No pin assigned.  
**nRESET**: Implemented in picoprobe behind `PROBE_PIN_RESET` compile flag; not wired on current setup. Skip for now.  
**UART**: Wired on Pico (GPIO 4/5) but not connected to target for testing yet.

---

## Features

Features are grouped by layer. Within each layer, items are roughly ordered by implementation value.

---

### Layer 1 — CMSIS-DAP Protocol Completeness

#### 1.1 DAP_Info Full Parsing  **[COMPLETED]**
Implemented in `dap-core.js:dapInfo()`. Queries 0xF0 (capabilities with all 8 bits parsed), 0xFE (max packet count), 0xFF (max packet size). Returns `hasSWD`, `hasJTAG`, `hasSWO_UART`, `hasSWO_Manchester`, `hasAtomicCommands`, `hasTestDomainTimer`, `hasSWO_Streaming`, `hasUART`. UI gates on `hasUART` for UART panel.

**Minor gap**: 0xFD (SWO buffer size), 0xFB/0xFC (UART RX/TX buffer sizes) not queried — low priority.

#### 1.2 DAP_WriteABORT  **[COMPLETED]**
Implemented in `dap-core.js:writeAbort()`. Sends command 0x08 with DAP index 0 and 32-bit LE value. Default value 0x0000001E (clears ORUNERRCLR, WDERRCLR, STKERRCLR, STKCMPCLR).

**Minor gap**: Not yet used in `transfer()` error path — line-reset is still the recovery mechanism. Could replace line-reset with writeAbort+re-select for cleaner fault recovery.

#### 1.3 Command Pipelining (DAP_ExecuteCommands / DAP_QueueCommands)  **[PARTIALLY DONE]**
**Completed**: `DAP_ExecuteCommands (0x7F)` implemented in `dap-core.js:executeCommands()`. Batches multiple DAP commands into one USB packet. Gated on `hasAtomicCommands` capability.
**Remaining**:
- `DAP_QueueCommands (0x7E)` — not implemented.
- Integrate `executeCommands` into `writeMemBlockFast`/`readMemBlockFast` to batch CSW+TAR writes with block transfer setup.
- Integrate into NVMC erase/ready-poll sequences during flash.
- Expected speedup: ~2× on block write setup overhead.

#### 1.4 DAP_UART Passthrough (DAP_UART_*)  **[COMPLETED]**
All five commands implemented in `dap-uart.js:DapUartSession`: `setTransport(0x1F)`, `configure(0x20)`, `control(0x22)`, `status(0x23)`, `transfer(0x21)`. High-level `open()`/`close()`/`send()` with polling. UI panel in `uart-panel.js` gated on `hasUART` capability bit.

**Physical test deferred until UART lines are connected to target.**

---

### Layer 2 — Target Abstraction & Multi-Target Support

#### 2.1 Target Interface Refactor  **[PARTIALLY DONE]**
**Completed**: `targets/target-registry.js` — `TARGETS` array with nRF52840/833/832/5340-app/generic entries. `detectTarget(adi)` reads FICR and auto-selects. Backend uses `activeTarget` on connect.
**Remaining**:
- Formal `TargetInterface` class with `identify()`, `flash()`, `memoryMap` methods.
- Move nRF52840 specific code from `nrf52-target.js`/`flash-nrf52.js` into `targets/nrf52840.js`.
- Target selector UI dropdown (manual override if detection fails).

#### 2.2 Additional Targets  **[PARTIALLY DONE]**
**Completed**: nRF52832, nRF52833, nRF5340 App core in `target-registry.js` with flash/RAM/UICR specs. All use `nvmc-nrf52` programmer (except nRF5340 marked `unsupported`).
**Remaining**:
- nRF5340 Net core (AP1, flash at 0x01000000, 2KB pages).
- STM32F4, STM32G0/G4, RP2040 targets.
- Target selector UI dropdown populated from registry.
- Per-target flash programmers (NVMC registers vary, STM32 uses different algo, RP2040 uses ROM bootrom).

---

### Layer 3 — Device Recovery

#### 3.1 nRF52 APPROTECT Recovery (CTRL-AP Mass Erase)  **[COMPLETED]**
`nrf52-recovery.js:Nrf52Recovery` — `checkProtection()` reads APPROTECTSTATUS, `eraseAll()` writes ERASEALL, polls ERASEALLSTATUS, asserts RESET, reconnects SWD. `recovery.js` UI: "Check Protection" + "Recover Device" buttons with confirm dialog. Exposed as `backend.recoverDevice()` and `backend.checkProtection()`.

**Extends to nRF52832/nRF5340** — same CTRL-AP mechanism, same registers (registry entries have `hasCtrlAp: true`).

---

### Layer 4 — RTT (Real-Time Transfer)

#### 4.1 RTT Reader  **[COMPLETED]**
`rtt/rtt-client.js:RttClient` — `search(ramStart, ramSize)` scans for "SEGGER RTT" magic, validates MaxNumUp/DownBuffers, parses channel descriptors. `startPolling(intervalMs)` drains up-channel ring buffers with wraparound handling. `write(channel, data)` writes to down channels. `stop()` halts polling. Events: `data`, `channel-found`, `error`. UI in `rtt-panel.js`: search button, start/stop, polling interval, TX input, auto-scroll log.

---

### Layer 5 — UI/UX Overhaul

#### 5.1 Flash Memory Visualizer  **[COMPLETED]**
`ui/flash-visualizer.js:renderFlashVisualizer()` — SVG bar with colored regions: named sub-regions (MBR, BL) per target, file segments with per-file colors and tooltips, read-back regions (green=ok, red=failed). Tick marks with address labels. Shared component used by hex-manager and memory reader.

#### 5.2 Multi-Hex Loader  **[COMPLETED]**
`hex/multi-hex-merger.js:mergeHexFiles()` merges multiple HEX into one address→byte map. Conflict detection flags overlapping addresses with different values. `ui/hex-manager.js` — multi-file picker, drag-and-drop, per-file color dots, remove buttons, "Clear all", merged policy validation. Visualizer shows each file in distinct color.

#### 5.3 Memory Read & Visualization  **[COMPLETED]**
`ui/memory.js` — address + length inputs, "Read" button, hex dump display (address | hex bytes | ASCII). "Read all flash" shortcut reads entire flash with progress. Export as binary or Intel HEX. Read regions overlay on flash visualizer (green/red). `window.readRegions` shared with visualizer.

#### 5.4 UI Streamlining  **[COMPLETED]**
Tab bar layout (Flash/Verify/Memory/RTT/UART/Info) — shown when connected. Connection status bar with probe/target info. Collapsed event log (expand on click). Progress bar for flash operations. Dark/light theme toggle persisted to localStorage. Settings (SWD clock, UART baud, RTT params, memory address) persisted to localStorage.

#### 5.5 SWD Multi-Drop (SWD v2 Target Selection)  **[PARTIALLY DONE]**
**Completed**: `dap-core.js:selectSwdTarget(targetSel)` — full protocol implementation: dormant-to-SWD activation sequence, TARGETSEL write via raw SWD packet, DPIDR verification.
**Remaining**:
- Target scanning/discovery UI (enumerate targets on shared bus).
- Multi-core chip support in UI (nRF5340 app + net cores).
- Integration with target registry so both cores appear for selection.
- nRF5340 net core AP1 access.

---

## Implementation Order (Suggested)

| Phase | Items | Status |
|-------|-------|--------|
| 1 | 1.1 (DAP_Info) ✅, 1.2 (WriteABORT) ✅, 3.1 (Recovery) ✅ | **Done** |
| 2 | 2.1 (Target interface) ~80%, 2.2 (nRF52832 ✅, nRF5340-app ✅, rest pending) | **In progress** |
| 3 | 5.1 (Visualizer) ✅, 5.2 (Multi-hex) ✅, 5.3 (Mem read) ✅ | **Done** |
| 4 | 4.1 (RTT) ✅ | **Done** |
| 5 | 1.3 (Pipelining) ~50% (executeCommands done, integration pending) | **In progress** |
| 6 | 5.4 (UI streamlining) ✅ | **Done** |
| 7 | 1.4 (UART) ✅, 5.5 (Multi-drop) ~70% (protocol done, UI pending) | **Mostly done** |
| A–F | 6.1–6.6 (CMSIS Pack / FLM) | **Not started** |

---

---

## Layer 6 — CMSIS Pack Device Support

Goal: support any Cortex-M target with a CMSIS pack, not just nRF52 family.  
Two independent sub-goals: (A) device metadata database, (B) generic flash via FLM execution.

---

### 6.1 Device Database Build Script (Tier A)

**Status**: Not started.  
**Output**: `src/targets/cmsis-device-db.js` — static JS module with ~10k device entries.

**Work**:
- Python build script `tools/export-cmsis-devices.py`:
  ```python
  from cmsis_pack_manager import Cache
  c = Cache(True, True)
  c.cache_descriptors()   # downloads all PDSC metadata (~50MB, cached)
  for name, dev in c.index.items():
      emit({ name, flash: dev["memory"]["IROM1"], ram: dev["memory"]["IRAM1"],
             algorithm: dev.get("algorithm"), pdsc: dev["pdsc_file"] })
  ```
- Output JSON: `{ id, label, vendor, flash: {start, size}, ram: {start, size}, flmPath, packUrl }`
- Convert to `export const CMSIS_DEVICES = [...]` — tree-shakeable ES module
- Run once at build time; commit result (or CI artifact)

**Wiring**:
- Add search/filter UI in connection panel (vendor + part name typeahead)
- `detectTarget()` falls back to CMSIS_DEVICES lookup if FICR miss
- Device entry feeds flash visualizer with correct flash/RAM layout

**No runtime pack fetching needed. Zero FLM complexity.**

---

### 6.2 `writeRegister` in `DapCortex` (prerequisite for 6.3)

**Status**: `readRegister` exists (`dap-cortex.js:55`), `writeRegister` missing.  
**Work**:
- Add to `DapCortex`:
  ```javascript
  async writeRegister(regNum, value) {
    await this.adi.writeMem32(DCRDR, value >>> 0);
    await this.adi.writeMem32(DCRSR, (1 << 16) | (regNum & 0x1f));
    const start = Date.now();
    while (Date.now() - start < 100) {
      const dhcsr = await this.adi.readMem32(DHCSR);
      if (dhcsr & S_REGRDY) return;
    }
    throw new Error("Register write timeout");
  }
  ```
- Register numbers: r0=0, r1=1, r2=2, r3=3, sp=13, lr=14, pc=15
- Add `writeCoreRegs(map)` helper: takes `{pc, sp, lr, r0, r1, r2, r3}`, writes each

**Test**: halt nRF52840, write PC to known address, resume, verify DHCSR shows running.

---

### 6.3 FPB Breakpoint for Function-Return Detection (prerequisite for 6.4)

**Status**: Not implemented.  
**Background**: FLM execution calls functions by setting `LR = BKPT_ADDR`, then resumes. When function returns, CPU jumps to BKPT_ADDR and halts. Cleaner than polling a busy loop; standard approach in pyOCD/probe-rs.

**FPB registers (Cortex-M3/M4/M7):**
| Register | Address | Purpose |
|----------|---------|---------|
| FP_CTRL  | 0xe0002000 | Enable FPB, read NUM_CODE |
| FP_COMP0 | 0xe0002008 | Set comparator 0 address |

**Work** — new file `src/backends/cmsis-dap/fpb.js`:
```javascript
const FP_CTRL  = 0xe0002000;
const FP_COMP0 = 0xe0002008;
export const BKPT_ADDR = 0xFFFFFFFE;  // thumb LSB trick, or use actual RAM addr

export class Fpb {
  constructor(adi) { this.adi = adi; }

  async enable() {
    await this.adi.writeMem32(FP_CTRL, 0x03);  // KEY=1, ENABLE=1
  }

  async setBreakpoint(addr) {
    // addr must be halfword-aligned; bit 0 = ENABLE, bits 31:2 = COMP
    await this.adi.writeMem32(FP_COMP0, (addr & ~0x3) | 0x1);
  }

  async disable() {
    await this.adi.writeMem32(FP_COMP0, 0);
    await this.adi.writeMem32(FP_CTRL, 0x02);  // KEY=1, ENABLE=0
  }
}
```

**Note**: Cortex-M0/M0+ lack FPB comparators for data. Use BKPT instruction embedded in a small RAM trampoline instead (2 bytes: `0xBE00` = `BKPT #0`).

---

### 6.4 ELF Parser for FLM Binaries (prerequisite for 6.5)

**Status**: Not implemented.  
**New file**: `src/targets/elf-parser.js`

**FLM ELF structure:**
- ELF32 LE, ARM architecture (e_machine = 0x28)
- 1–2 PT_LOAD segments (text + data)
- `FlashDevice` struct at fixed symbol `__FlashDevice` or at start of `.data` segment
- All code is PIC (no relocations needed beyond base address)

**Work**:
```javascript
export function parseFlmElf(buffer) {
  const view = new DataView(buffer);
  // 1. Validate ELF magic: 0x7f 45 4c 46
  // 2. Read e_phoff, e_phnum → iterate PT_LOAD segments
  //    each: { p_vaddr, p_offset, p_filesz, p_memsz }
  // 3. Read e_entry → function table entry point
  // 4. Locate FlashDevice struct (fixed offset 0 in first segment, or by symbol name)
  //    struct layout (ARM ABI, packed):
  //      u16  Vers          // = 0x0101
  //      u16  Type          // 1=Onchip, 2=Ext8Bit, etc
  //      u32  DevAdr        // flash base address
  //      u32  DevSz         // flash total size
  //      u32  PageSz        // write page size
  //      u32  _reserved
  //      u32  valEmpty      // erased byte value (usually 0xFF)
  //      u32  toProg        // page program timeout ms
  //      u32  toErase       // sector erase timeout ms
  //      [512 bytes] sectors: array of { szSector: u32, AddrSector: u32 }
  //                           terminated by { 0xFFFFFFFF, 0xFFFFFFFF }
  // 5. Return: { segments, entry, flashDevice }
}
```

**Function table layout** (at `entry`):
```
+0x00  Init(adr, clk, fnc)   → PC to call
+0x08  UnInit(fnc)
+0x10  EraseChip()
+0x18  EraseSector(adr)
+0x20  ProgramPage(adr, sz, buf)
+0x28  Verify(adr, sz, buf)
+0x30  BlankCheck(adr, sz, pat)
```

---

### 6.5 Flash Agent Executor (Tier B — main FLM engine)

**Status**: Not implemented.  
**New file**: `src/targets/flash-agent.js`

**Prerequisites**: 6.2 (writeRegister), 6.3 (FPB), 6.4 (ELF parser), existing `DapCortex` halt/resume.

**Execution protocol** (mirrors pyOCD/probe-rs):
```
1. halt target (DapCortex.halt())
2. save current CPU registers (readCoreRegs)
3. upload FLM segments to target RAM (adi.writeMemBlock)
4. place BKPT trampoline at BKPT_ADDR in RAM (2 bytes: 0xBE 0x00)
5. enable FPB breakpoint at BKPT_ADDR
6. for each function call:
   a. writeCoreRegs({ pc: funcAddr | 1, lr: BKPT_ADDR | 1, sp: ramStackTop,
                      r0: arg0, r1: arg1, r2: arg2, r3: arg3 })
   b. resume()
   c. poll DHCSR S_HALT (with timeout per FlashDevice.toProg/toErase)
   d. read r0 for return value; nonzero = error
7. restore saved registers; resume target
```

**Public API**:
```javascript
export class FlashAgent {
  constructor(cortex, adi, ramBase, ramSize) { ... }
  async load(flmBuffer)                // parse ELF, upload to RAM
  async init(flashBase, clock)         // call Init(flashBase, clock, 1)
  async eraseSector(addr)              // call EraseSector(addr)
  async eraseChip()                    // call EraseChip()
  async programPage(addr, pageData)    // call ProgramPage(addr, sz, buf)
  async unInit()                       // call UnInit(1)
  async programImage(image)            // full flow: init→erase pages→program pages→uninit
}
```

**RAM layout** (within target RAM, above stack):
```
ramBase + 0x0000  →  FLM text segment
ramBase + textSz  →  FLM data segment
ramBase + dataSz  →  page buffer (max pageSize bytes, passed as arg to ProgramPage)
ramBase + bufEnd  →  BKPT trampoline (2 bytes)
ramBase + ...     →  stack (grows down from ramTop)
```

**Wire into backend**: `flash-nrf52.js` stays for nRF52 (faster, no RAM needed). For non-nRF targets detected via CMSIS_DEVICES, instantiate `FlashAgent` instead.

---

### 6.6 Pack Fetcher + FLM Extraction

**Status**: Not started. Depends on 6.4, 6.5.  
**New file**: `src/targets/pack-fetcher.js`

**Options (choose one):**

| Strategy | Pros | Cons |
|----------|------|------|
| **Pre-extracted FLMs** (recommended first) | No CORS, works offline, small files | Must extract at build time per device |
| **Runtime pack fetch via proxy** | Full live catalog | Needs proxy server, breaks static hosting |
| **User uploads pack file** | No CORS, no server | Manual step |

**Pre-extraction (recommended)**:
- Extend `tools/export-cmsis-devices.py` to also extract FLM binaries into `public/flm/<vendor>/<device>.flm`
- Browser fetches `./flm/<vendor>/<device>.flm` — same-origin, no CORS
- ~10–50 KB per device, only need ones users actually request

**Runtime fetch fallback**:
```javascript
export async function fetchFlm(packUrl, flmPath) {
  // packUrl = "https://www.keil.com/pack/Keil.STM32F4xx_DFP.2.17.0.pack"
  // flmPath = "Flash/STM32F4xx_1024.flm"
  const zip = await fetchAndUnzip(packUrl);   // needs JSZip or fflate
  return zip.file(flmPath).async("arraybuffer");
}
```

**CORS note**: Arm CDN does NOT set CORS headers. Pack fetch must go through proxy or Service Worker.

---

## Implementation Order (CMSIS Pack additions)

| Phase | Item | Status |
|-------|------|--------|
| A | **6.1** Device DB build script + UI search | **Not started** |
| B | **6.2** `writeRegister` in DapCortex | **Not started** |
| C | **6.3** FPB breakpoint | **Not started** |
| D | **6.4** ELF parser | **Not started** |
| E | **6.5** Flash agent executor | **Not started** |
| F | **6.6** FLM file hosting (pre-extracted) | **Not started** |

---

## Out of Scope (Researched & Ruled Out)

| Feature | Reason |
|---------|--------|
| SWO/SWV tracing | RP2040/RP2350 lacks SWO hardware. Not implementable in picoprobe regardless of firmware. |
| nRESET via DAP_SWJ_Pins | Pin requires `PROBE_PIN_RESET` compile flag in picoprobe + physical wire to target. Not wired. |
| DAP_ResetTarget (0x0A) | Returns 0 (disabled) in picoprobe. No-op. |
| JTAG | Board uses SWD only. |
