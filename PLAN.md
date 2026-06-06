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

## Layer 7 — xterm.js Interactive Terminal

Replace the current log-viewer terminal (TerminalBuffer + TerminalView + TerminalController) with [xterm.js](https://xtermjs.org/) across all three terminal channels: Serial, RTT, DAP UART.

### Goals

- Input cursor lives **inside** the terminal stream — no separate text field
- **Raw mode** by default: every keypress forwarded as bytes to device; device controls echo
- Full VT100/VT220 emulation: cursor movement, Zephyr shell, embedded Linux console
- Same 3-column layout: Templates sidebar | xterm.js | Queue sidebar
- Copy via mouse selection (xterm built-in), download via plain-text parallel buffer
- All three channels use the exact same `XtermTerminalPanel` — only the session differs
- `InputMode` interface abstracts raw vs line mode for future line-mode addition

### What gets dropped

| Removed feature | Reason |
|---|---|
| Filter (show/hide lines) | xterm.js has no native line-hiding |
| Local echo checkbox | Device controls echo in raw mode |
| CR-as-newline checkbox | xterm handles terminal emulation natively |
| Auto-scroll checkbox | xterm auto-scrolls natively |

---

### 7.1 npm setup + import maps  **[NOT STARTED]**

xterm.js is an npm package. This project has no root `package.json`. Add one.

**Step 1** — Create `/package.json` at project root:
```json
{
  "private": true,
  "dependencies": {
    "@xterm/xterm": "^5.5.0",
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/addon-web-links": "^0.11.0"
  }
}
```

**Step 2** — Run `npm install` at project root. This creates `/node_modules/`.

**Step 3** — Add `/node_modules/` to `.gitignore` (add as first line under existing entries).

**Step 4** — Add import map to `index.html` immediately before the first `<script type="module">` tag:
```html
<script type="importmap">
{
  "imports": {
    "@xterm/xterm": "./node_modules/@xterm/xterm/lib/xterm.js",
    "@xterm/addon-fit": "./node_modules/@xterm/addon-fit/lib/addon-fit.js",
    "@xterm/addon-web-links": "./node_modules/@xterm/addon-web-links/lib/addon-web-links.js"
  }
}
</script>
```

**Step 5** — Add xterm CSS to `index.html` `<head>` (after existing `<link>` tags):
```html
<link rel="stylesheet" href="./node_modules/@xterm/xterm/css/xterm.css" />
```

**Step 6** — Update `Makefile`. Add `npm install` as prerequisite to `serve` and `serve-https`:
```makefile
node_modules: package.json
	npm install

serve: node_modules stamp-build-info
	python -m http.server 8000

serve-https: node_modules stamp-build-info
	python3 serve-https.py 8443
```

**Step 7** — Update `sw.js` install handler. Add xterm files to the `cache.addAll([...])` list:
```javascript
"./node_modules/@xterm/xterm/lib/xterm.js",
"./node_modules/@xterm/xterm/css/xterm.css",
"./node_modules/@xterm/addon-fit/lib/addon-fit.js",
"./node_modules/@xterm/addon-web-links/lib/addon-web-links.js",
```

**Verify**: Open browser, import `{ Terminal } from "@xterm/xterm"` in the console — no 404.

---

### 7.2 Session API — add `sendRaw(bytes)`  **[NOT STARTED]**

The current `send(text)` method appends `\r\n` — this breaks interactive shells. Add a byte-level method.

**File: `src/ui/terminals/terminal-session.js`**

Add these two methods to the `TerminalSession` class:
```javascript
// Transmit raw bytes with no modification. Used by xterm raw mode.
async sendRaw(bytes) { throw new Error("TerminalSession.sendRaw not implemented"); }

// Transmit text with CRLF. Default implementation calls sendRaw.
async sendLine(text) {
  await this.sendRaw(new TextEncoder().encode(`${text}\r\n`));
}
```

Change `send(text)` to delegate:
```javascript
async send(text) { return this.sendLine(text); }
```

Remove these getters — they rely on the old HTML structure that xterm replaces:
- `get logSelector()`
- `get txInputSelector()`
- `get btnSendSelector()`

**File: `src/ui/terminals/serial-session.js`**

Add `sendRaw`:
```javascript
async sendRaw(bytes) {
  await this._serialManager.send(bytes);
}
```

Remove the old `send(text)` override (the base class default now handles it via `sendLine`).

**File: `src/ui/terminals/dap-uart-session.js`**

Add `sendRaw`:
```javascript
async sendRaw(bytes) {
  if (!this._uart) throw new Error("UART not connected");
  await this._uart.send(bytes);
}
```

Remove the old `send(text)` override.

**File: `src/ui/terminals/rtt-session.js`**

Add `sendRaw`:
```javascript
async sendRaw(bytes) {
  if (!this._rttClient) throw new Error("RTT not connected");
  await this._rttClient.write(0, bytes);
}
```

Remove the old `send(text)` override. Note: old code appended `"\n"` — raw mode lets the device handle line endings.

**Important note about RTT and DAP UART sessions**: Both `RttSession.init()` and `DapUartTerminalSession.init()` access `rootEl` to find transport-specific buttons (`#btn-rtt-search`, `#uart-baud-select`, etc.). This `rootEl` must be the **section element** containing those buttons, NOT the small xterm container div. See step 7.6 for how `app.js` passes the right element.

**Tests to write** (`tools/tests/terminal-session-sendraw.test.mjs`):
- `sendRaw` on SerialSession calls `serialManager.send(bytes)` with exact bytes
- `sendLine("hello")` encodes `"hello\r\n"` and calls `sendRaw`
- `send("hello")` delegates to `sendLine`

---

### 7.3 InputMode interface  **[NOT STARTED]**

Abstract the "what happens when xterm fires onData" logic so raw mode and future line mode are swappable.

**New file: `src/ui/terminals/input-mode.js`**

```javascript
const _encoder = new TextEncoder();

export class RawInputMode {
  constructor(session) {
    this._session = session;
  }
  // Called by xterm.onData(data) — data is a string of chars/escape sequences
  handle(data) {
    if (!this._session.isReady()) return;
    void this._session.sendRaw(_encoder.encode(data));
  }
}

// Future: export class LineInputMode { ... }
// Line mode buffers locally, shows in terminal, sends on Enter.
```

**Tests** (`tools/tests/input-mode.test.mjs`):
- `handle()` calls `session.sendRaw()` with encoded bytes
- `handle()` is a no-op when `session.isReady()` returns false

---

### 7.4 Extract TerminalSidebarController  **[NOT STARTED]**

The template sidebar and queue sidebar rendering currently lives in `TerminalController` (~400 lines). `XtermTerminalPanel` needs those sidebars but NOT the keyboard input handling. Extract sidebar logic into its own class.

**New file: `src/ui/components/terminal-sidebar-controller.js`**

Move out of `terminal-controller.js`:
- Template sidebar: `_renderTemplates()`, `_showTemplateEditor()`, template card rendering, var inputs, Buffer/Send buttons
- Queue sidebar: `_renderQueue()`, queue card rendering, Send Queue / Stop / Clear buttons

Constructor signature:
```javascript
export class TerminalSidebarController {
  constructor({ rootEl, channelId, send, isReady, logger }) {
    // rootEl: the panel's container — sidebars are appended here
    // channelId: "serial" | "uart" | "rtt" — for localStorage keys
    // send(text): function called when user clicks Send on a template or queue item
    //             In xterm panel: (text) => session.sendRaw(encoder.encode(text + "\r"))
    // isReady(): function returning bool — gates Send buttons
  }
  mount() { /* builds sidebar DOM, subscribes to template store */ }
  destroy() { /* removes DOM, cleans up listeners */ }
}
```

**Update `TerminalController`** to use `TerminalSidebarController` internally (no behavior change — just delegates to the extracted class). This makes the existing panel keep working while enabling xterm to reuse the same sidebars.

---

### 7.5 XtermTerminalPanel  **[NOT STARTED]**

**New file: `src/ui/panels/xterm-terminal-panel.js`**

```javascript
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { RawInputMode } from "../terminals/input-mode.js";
import { TerminalSidebarController } from "../components/terminal-sidebar-controller.js";
import { downloadLog } from "../log-panel-helpers.js";
import { BasePanel } from "./base-panel.js";

export class XtermTerminalPanel extends BasePanel {
  constructor({ session, bus, backendProvider, logger }) { ... }
  mount(containerEl, sessionControlsEl = containerEl) { ... }
  unmount() { ... }
}
```

**`mount(containerEl, sessionControlsEl)` — step by step:**

1. Store refs. `containerEl` is where xterm renders. `sessionControlsEl` is where transport buttons live (may be the same, or the parent section for RTT/UART).

2. Build layout inside `containerEl` using `innerHTML`:
   ```html
   <div class="terminal-panel-grid">
     <aside class="terminal-templates-slot"></aside>
     <div class="terminal-xterm-col">
       <div class="terminal-toolbar-row">
         <button class="btn-xterm-clear">Clear</button>
         <button class="btn-xterm-copy">Copy All</button>
         <button class="btn-xterm-download">Download Log</button>
       </div>
       <div class="xterm-mount-point"></div>
     </div>
     <aside class="terminal-queue-slot"></aside>
   </div>
   ```

3. Create xterm Terminal:
   ```javascript
   this._term = new Terminal({
     cursorBlink: true,
     convertEol: false,
     scrollback: 10_000,
     fontFamily: 'ui-monospace, Menlo, Consolas, "Liberation Mono", monospace',
     fontSize: 14,
     lineHeight: 1.2,
     theme: {
       background: "#050807",
       foreground: "#d7f7d7",
       cursor: "#d7f7d7",
       selectionBackground: "#355c7d44",
     },
   });
   ```

4. Load addons and open:
   ```javascript
   this._fitAddon = new FitAddon();
   this._term.loadAddon(this._fitAddon);
   this._term.loadAddon(new WebLinksAddon());
   this._term.open(containerEl.querySelector(".xterm-mount-point"));
   this._fitAddon.fit();
   ```

5. Wire input: `const inputMode = new RawInputMode(this._session);`
   `this._term.onData(data => inputMode.handle(data));`

6. Plain-text log buffer (for download): `this._logLines = [];`

7. Init session:
   ```javascript
   const decoder = new TextDecoder("utf-8", { fatal: false });
   this._sessionCleanup = this._session.init({
     rootEl: sessionControlsEl,
     bus: this._bus,
     backendProvider: this._backendProvider,
     onData: (bytes) => {
       const text = decoder.decode(bytes, { stream: true });
       this._term.write(text);
       this._logLines.push(text);
     },
     onReadyChange: () => {
       if (this._session.isReady()) {
         this._term.writeln("\r\n\x1b[32m[connected]\x1b[0m");
         this._term.focus();
       } else {
         this._term.writeln("\r\n\x1b[33m[disconnected]\x1b[0m");
       }
     },
   });
   ```

8. ResizeObserver: `new ResizeObserver(() => this._fitAddon.fit()).observe(containerEl);`

9. Wire toolbar buttons:
   - Clear: `this._term.clear(); this._logLines = [];`
   - Copy All:
     ```javascript
     navigator.clipboard.writeText(this._logLines.join("")).then(() => {
       const btn = containerEl.querySelector(".btn-xterm-copy");
       const orig = btn.textContent;
       btn.textContent = "Copied!";
       setTimeout(() => { btn.textContent = orig; }, 1500);
     });
     ```
   - Download: `downloadLog(this._logLines.join(""), \`${channelId}-log-${timestamp}.txt\`)`

10. Mount sidebars:
    ```javascript
    this._sidebar = new TerminalSidebarController({
      rootEl: containerEl,
      channelId: this._session.channelId,
      send: (text) => this._session.sendRaw(new TextEncoder().encode(text + "\r")),
      isReady: () => this._session.isReady(),
      logger: this._logger,
    });
    this._sidebar.mount();
    ```
    Note: `text + "\r"` sends CR only — shells expect CR, not CRLF.

**`unmount()`:**
```javascript
unmount() {
  this._resizeObserver?.disconnect();
  this._sessionCleanup?.();
  this._sidebar?.destroy();
  this._term?.dispose();
  this._term = null;
  this._sessionCleanup = null;
  this._sidebar = null;
  this._logLines = [];
  this._teardown(); // BasePanel cleanup
}
```

---

### 7.6 HTML changes in index.html  **[NOT STARTED]**

**RTT section (`#tab-rtt`)** — Keep all RTT transport controls. Remove old terminal HTML. Add xterm container.

Remove:
```html
<button id="btn-rtt-clear" ...>Clear Log</button>
<button id="btn-rtt-download" ...>Download Log</button>
<label ...><input id="chk-rtt-autoscroll" .../> Auto-scroll</label>
<label ...><input id="chk-rtt-cr-newline" .../> Treat CR as newline</label>
<label ...><input id="chk-rtt-echo" .../> Local echo</label>
<pre id="rtt-log" ...></pre>
<div class="row" ...> <!-- input + send button row -->
  <input id="rtt-tx-input" .../>
  <button id="btn-rtt-send" ...>Send</button>
</div>
```

Add after `<p id="rtt-status">`:
```html
<div id="rtt-terminal" style="flex:1;min-height:0;display:flex;flex-direction:column;"></div>
```

**UART section (`#tab-uart`)** — Keep baud select, Connect/Disconnect, status paragraph. Remove old terminal HTML. Add xterm container.

Remove:
```html
<button id="btn-uart-clear" ...>Clear Log</button>
<button id="btn-uart-download" ...>Download Log</button>
<label ...><input id="chk-uart-autoscroll" .../> Auto-scroll</label>
<label ...><input id="chk-uart-cr-newline" .../> Treat CR as newline</label>
<label ...><input id="chk-uart-echo" .../> Local echo</label>
<pre id="uart-log" ...></pre>
<div class="row" ...> <!-- input + send button row -->
  <input id="uart-tx-input" .../>
  <button id="btn-uart-send" ...>Send</button>
</div>
```

Add after `<p id="uart-status">`:
```html
<div id="uart-terminal" style="flex:1;min-height:0;display:flex;flex-direction:column;"></div>
```

**Serial terminal section (`#serial-terminal-panel`)** — Remove everything inside except the outer `<section>`. The panel will build all its own content.

Remove all children of `#serial-terminal-panel`. Add:
```html
<section class="panel" id="serial-terminal-panel">
  <div id="serial-terminal" style="flex:1;min-height:0;display:flex;flex-direction:column;"></div>
</section>
```

---

### 7.7 app.js changes  **[NOT STARTED]**

```javascript
// Remove:
import { UnifiedTerminalPanel } from "./ui/panels/unified-terminal-panel.js";

// Add:
import { XtermTerminalPanel } from "./ui/panels/xterm-terminal-panel.js";
```

Replace the three panel instantiations:

```javascript
// RTT — note: sessionControlsEl = tab-rtt (has Search/Start buttons)
const rttPanel = new XtermTerminalPanel({ session: new RttSession({ backendProvider }), bus, backendProvider, logger });
rttPanel.mount(document.getElementById("rtt-terminal"), document.getElementById("tab-rtt"));

// UART — note: sessionControlsEl = tab-uart (has baud select / Connect buttons)
const uartPanel = new XtermTerminalPanel({ session: new DapUartTerminalSession({ backendProvider, logger }), bus, backendProvider, logger });
uartPanel.mount(document.getElementById("uart-terminal"), document.getElementById("tab-uart"));

// Serial — sessionControlsEl not needed (SerialSession doesn't touch DOM)
const serialTerminalPanel = new XtermTerminalPanel({ session: new SerialSession({ serialManager }), bus, backendProvider, logger });
serialTerminalPanel.mount(document.getElementById("serial-terminal"));
```

Remove any references to `serialLogger`, `createPanelLogger`, log-related elements that existed only for the old terminal.

---

### 7.8 CSS changes  **[NOT STARTED]**

xterm.js injects its own `.xterm` CSS (already linked in step 7.1). You mainly need to ensure the xterm container fills its space.

Add to `styles/terminal.css`:
```css
/* xterm.js needs its container to have an explicit height */
.xterm-mount-point {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.xterm-mount-point .xterm,
.xterm-mount-point .xterm-viewport,
.xterm-mount-point .xterm-screen {
  height: 100% !important;
}
```

Remove CSS rules from `styles/terminal.css` that targeted:
- `.terminal-send-row` (the old input row)
- `.term-line`, `.term-line-pending` (old line rendering)
- `.term-match`, `.term-match-current` (old search highlights)
- `.history-popup` (old history dropdown above input)

---

### 7.9 Delete legacy files  **[NOT STARTED]**

Only delete after all tests pass and the browser is confirmed working.

| File | Action |
|------|--------|
| `src/ui/terminal-buffer.js` | Delete |
| `src/ui/terminal-view.js` | Delete |
| `src/ui/panels/unified-terminal-panel.js` | Delete |
| `src/ui/components/terminal-controller.js` | Delete (sidebar code moved to TerminalSidebarController in 7.4) |
| `src/ui/views/terminal-match-highlighter.js` | Delete (search highlights were part of old view) |
| `src/ui/components/terminal-search-index.js` | Delete (can be revived later for xterm SearchAddon) |

Keep:
- `src/ui/terminals/terminal-session.js` ✓ (updated)
- `src/ui/terminals/serial-session.js` ✓ (updated)
- `src/ui/terminals/dap-uart-session.js` ✓ (updated)
- `src/ui/terminals/rtt-session.js` ✓ (updated)
- `src/ui/components/terminal-template-store.js` ✓
- `src/ui/components/terminal-queue-runner.js` ✓
- `src/ui/components/terminal-history-store.js` ✓ (for future line mode)

---

### 7.10 Implementation order

Do these steps in order. Each step should leave the codebase working (tests pass, no broken imports).

| Step | Task | Key check |
|------|------|-----------|
| 1 | npm setup + import maps (7.1) | `import { Terminal } from "@xterm/xterm"` works in browser console |
| 2 | `sendRaw` on all sessions + tests (7.2) | New tests pass, existing tests unbroken |
| 3 | `InputMode` + tests (7.3) | `input-mode.test.mjs` passes |
| 4 | Extract `TerminalSidebarController` (7.4) | All existing terminal tests still pass |
| 5 | Build `XtermTerminalPanel` skeleton — mount/unmount, no sidebars yet | xterm renders in browser, RX data appears, keypresses send bytes |
| 6 | Wire Serial channel end-to-end | Type in xterm, bytes go to serial device |
| 7 | Add sidebars to panel (use `TerminalSidebarController`) | Templates + Queue appear and work |
| 8 | HTML cleanup — Serial section first (7.6) | Serial section looks correct |
| 9 | app.js: switch Serial panel to `XtermTerminalPanel` (7.7) | Serial terminal fully working |
| 10 | HTML + app.js: wire RTT channel | RTT channel working |
| 11 | HTML + app.js: wire UART channel | UART channel working |
| 12 | CSS fixes (7.8) | Layout looks correct, xterm fills container |
| 13 | Delete legacy files (7.9) | All tests pass, no dead imports |

---

## Out of Scope (Researched & Ruled Out)

| Feature | Reason |
|---------|--------|
| SWO/SWV tracing | RP2040/RP2350 lacks SWO hardware. Not implementable in picoprobe regardless of firmware. |
| nRESET via DAP_SWJ_Pins | Pin requires `PROBE_PIN_RESET` compile flag in picoprobe + physical wire to target. Not wired. |
| DAP_ResetTarget (0x0A) | Returns 0 (disabled) in picoprobe. No-op. |
| JTAG | Board uses SWD only. |
