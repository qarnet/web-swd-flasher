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

#### 1.1 DAP_Info Full Parsing
**Status**: Partially done — we call `DAP_Info 0x04` for packet size but ignore the capabilities byte.  
**Work**:  
- Query `Info ID 0xF0` (capabilities bitmask) on connect. Parse bits:
  - Bit 0: SWD, Bit 1: JTAG, Bit 2: SWO UART, Bit 3: SWO Manchester,
    Bit 4: Atomic Commands, Bit 5: Test Domain Timer, Bit 6: SWO Streaming, Bit 7: UART Port
- Query `0xFD` (SWO trace buffer size), `0xFB`/`0xFC` (UART RX/TX buffer sizes), `0xFE` (max packet count), `0xFF` (max packet size).
- Expose result as `backend.probeCapabilities` — used by UI to show/hide features and by pipelining to verify probe support.

**No extra hardware needed.**

#### 1.2 DAP_WriteABORT
**Status**: Not implemented. We currently do line-reset + retry on WAIT/FAULT.  
**Work**:  
- Add `dapCore.writeAbort(value)` sending command `0x08`:
  ```
  byte 0: 0x08 (DAP_WriteABORT)
  byte 1: 0x00 (DAP index, always 0)
  bytes 2-5: abort value (little-endian)
  ```
- Common abort value: `0x0000001E` (clears ORUNERRCLR, WDERRCLR, STKERRCLR, STKCMPCLR).
- Replace the line-reset path in `transfer()` error handling with a proper abort + re-select sequence.

**No extra hardware needed.**

#### 1.3 Command Pipelining (DAP_ExecuteCommands / DAP_QueueCommands)
**Status**: Not implemented. Every DAP_Transfer is a separate USB round-trip.  
**Work**:  
- `DAP_ExecuteCommands (0x7F)`: Batch multiple DAP commands into one USB packet, get one response. Probe executes sequentially, no host intervention between commands.
- `DAP_QueueCommands (0x7E)`: Queue commands across multiple USB packets, execute as atomic batch. More complex; requires probe support (check capabilities bit 4 from 1.1).
- Implementation path:
  - Add `dapCore.executeCommands(cmds[])` that serializes multiple command payloads into a single packet (if they fit within `packetSize`).
  - Use in `writeMemBlockFast` and `readMemBlockFast` to batch the CSW + TAR writes with the block transfer setup.
  - Potentially batch NVMC erase/ready-poll sequences during flash.
- Expected speedup: ~2× on block write setup overhead (currently 2 USB round-trips per 1KB chunk just for CSW+TAR).

**Requires probe capabilities bit 4 (`Atomic Commands`). Check on connect; fall back to current behavior if not set.**

#### 1.4 DAP_UART Passthrough (DAP_UART_*)
**Status**: Not implemented. Pico probe has UART wired on GPIO 4/5 but not connected to target yet.  
**Commands**:
- `DAP_UART_Transport (0x1F)`: select USB CDC or DAP UART mode.
- `DAP_UART_Configure (0x20)`: set baud, data bits, parity, stop bits.
- `DAP_UART_Control (0x22)`: enable/disable RX/TX.
- `DAP_UART_Status (0x23)`: read RX/TX buffer fill levels and error flags.
- `DAP_UART_Transfer (0x21)`: send/receive data blocks.
**Work**:  
- Implement all five commands in `dap-core.js` as a `UartSession` class.
- Add UI panel: baud selector, connect/disconnect button, scrolling RX log, TX text input.
- Gate UI on `probeCapabilities` UART bit (bit 7).
- Physical test deferred until UART lines are connected to target.

---

### Layer 2 — Target Abstraction & Multi-Target Support

#### 2.1 Target Interface Refactor
**Status**: Only nRF52840 supported, hardcoded in `nrf52-target.js` and `flash-nrf52.js`.  
**Work**:  
- Define `TargetInterface`:
  ```
  identify() → { family, part, flash: { start, size, pageSize }, ram: { start, size } }
  flash()    → FlashProgrammer
  memoryMap  → [{ name, start, size, type }]
  ```
- Move nRF52840 into `targets/nrf52840.js`.
- Target detection: read DPIDR (already done), then read family-specific ID registers to select target.
- Target registry: `targets/registry.js` maps `(dpidr, targetId)` → target class.
- `backend.js` auto-detects on connect; user can override via target selector UI.

#### 2.2 Additional Targets
Targets to add after interface refactor:

| Target     | Flash start | Page size | Flash size | RAM          | Notes |
|------------|-------------|-----------|------------|--------------|-------|
| nRF52832   | 0x0 / 0x1000 | 4 KB    | 512 KB     | 0x20000000   | No bootloader on fresh chip |
| nRF52833   | 0x0 / 0x1000 | 4 KB    | 512 KB     | 0x20000000   | |
| nRF5340 App | 0x0        | 4 KB    | 1 MB       | 0x20000000   | Dual-core; app core AP0 |
| nRF5340 Net | 0x01000000 | 2 KB   | 256 KB     | 0x21000000   | Network core AP1 |
| STM32F4    | 0x08000000  | variable | variable  | 0x20000000   | Variable sector sizes |
| STM32G0/G4 | 0x08000000  | 2 KB    | variable   | 0x20000000   | |
| RP2040     | via ROM     | 4 KB    | external   | 0x20000000   | Flash via ROM bootrom |

Each target provides its own flash programmer (NVMC registers vary).

**Target selector UI**: dropdown populated from `registry.js`. Auto-detect on connect; allow manual override if detection fails.

---

### Layer 3 — Device Recovery

#### 3.1 nRF52 APPROTECT Recovery (CTRL-AP Mass Erase)
**Status**: Not implemented.  
**Background**: nRF52840 has a CTRL-AP at AP index 1 that is accessible even when the main AHB-AP (index 0) is locked by APPROTECT. Writing ERASEALL=1 to it triggers a mass erase that wipes flash + UICR, clearing the protection.

**CTRL-AP Register Map (AP index 1):**
| Register        | Offset | R/W | Description                         |
|-----------------|--------|-----|-------------------------------------|
| RESET           | 0x000  | R/W | Write 1 to reset, auto-clears       |
| ERASEALL        | 0x004  | W   | Write 1 to start mass erase         |
| ERASEALLSTATUS  | 0x008  | R   | 1 = erase in progress, 0 = done     |
| APPROTECTSTATUS | 0x00C  | R   | 0 = locked, 1 = unlocked            |

**Recovery sequence:**
```
1. selectAp(1, 0)                         // switch to CTRL-AP
2. writeAp(0x004, 1)                      // ERASEALL = 1
3. poll readAp(0x008) until 0             // wait ERASEALLSTATUS = 0 (up to 15s)
4. readAp(0x00C)                          // verify APPROTECTSTATUS = 1
5. writeAp(0x000, 1)                      // CTRL-AP RESET
6. SYSRESETREQ or power cycle
```
**Work**:  
- Add `Nrf52Recovery` class in `targets/nrf52840.js`.
- Expose `backend.recoverDevice()`.
- UI: "Recover Device" button, visible when connected. Shows warning before proceeding (mass erase = all data lost). Progress log showing erase status poll.
- Extend to nRF52832/nRF5340 (same CTRL-AP mechanism, same registers).

---

### Layer 4 — RTT (Real-Time Transfer)

#### 4.1 RTT Reader
**Status**: Not implemented. No extra hardware needed — uses SWD mem reads while target runs.  
**Background**: SEGGER RTT stores a control block in target RAM identified by the magic string `"SEGGER RTT\0\0\0\0\0\0"` (16 bytes). The host polls the ring buffer write/read pointers and drains data without halting the CPU.

**Control block layout (at found address):**
```
+0x00  [16 B] magic: "SEGGER RTT\0\0\0\0\0\0"
+0x10  [4 B]  MaxNumUpBuffers
+0x14  [4 B]  MaxNumDownBuffers
+0x18  [24 B × N] Up channel descriptors (target→host)
       +0x00  pName    (pointer to name string)
       +0x04  pBuffer  (pointer to ring buffer)
       +0x08  SizeOfBuffer
       +0x0C  WrOff    (written by target)
       +0x10  RdOff    (written by host)
       +0x14  Flags
... Down channel descriptors follow (host→target)
```

**Search algorithm:**
1. Read nRF52840 RAM in 256-word blocks starting at `0x20000000`.
2. Scan for 16-byte magic string (word-aligned steps).
3. On match: validate `MaxNumUpBuffers` and `MaxNumDownBuffers` (both < 32).
4. Parse channel descriptors.
5. Cache control block address for polling.

**Polling loop (once control block found):**
```javascript
const WrOff = await adi.readMem32(desc.pBuffer + 0x0C);
const RdOff = await adi.readMem32(desc.pBuffer + 0x10);
if (WrOff !== RdOff) {
  // handle wrap-around: two reads if WrOff < RdOff
  const data = await adi.readMemBlock(desc.pBuffer + RdOff, bytesAvailable);
  await adi.writeMem32(desc.pBuffer + 0x10, newRdOff);  // advance host read ptr
  emitToUI(data);
}
```

**Work**:
- `src/rtt/rtt-client.js`: `RttClient` class with `search(adi, ramStart, ramSize)`, `startPolling(intervalMs)`, `stop()`, events: `data`, `channel-found`, `error`.
- Handle ring buffer wraparound (WrOff < RdOff means data wraps at SizeOfBuffer).
- UI panel: RTT tab with channel tabs (ch0 = Terminal), start/stop button, auto-scroll log, clear button, polling interval slider.
- Write path (host→target, channel 0 down buffer): allows sending commands back to target.
- Default poll interval: 50ms. Adjustable 10–500ms.

---

### Layer 5 — UI/UX Overhaul

#### 5.1 Flash Memory Visualizer
**Status**: Currently just a text list of segments in the image-map box.  
**Work**:  
- SVG or Canvas bar spanning device flash range (e.g., 0x0 – 0x100000 for nRF52840 1MB).
- Color regions:
  - **Bootloader** (if known from target): dark gray, striped
  - **Will be erased + written**: blue (from loaded image)
  - **Already on device** (from memory read): green (optional, requires read-back)
  - **Empty** (erased / unknown): light gray
  - **Named regions** (UICR, MBR, settings storage, etc.): labeled bands
- Tooltip on hover: address range, size, region name.
- Updates live as hex files are loaded or memory is read back.
- Shared component used by both multi-hex loader and memory reader.

#### 5.2 Multi-Hex Loader
**Status**: Only one hex at a time. No merging.  
**Work**:  
- Accept multiple HEX files via drag-and-drop or multi-file picker.
- Parse each separately; merge into a single address→byte map.
- Conflict detection: if two files overlap at any address with different values, highlight conflict and block programming.
- Visualizer shows each file in a different color, labeled with filename.
- Policy check runs on the merged image.
- "Clear all" and per-file remove buttons.

#### 5.3 Memory Read & Visualization
**Status**: Only `window.readMemRange` in console.  
**Work**:  
- UI: address input + length input + "Read" button.
- Read via `adi.readMemBlockFast`, display as hex dump (address | hex bytes | ASCII) in a monospace box.
- Overlay read regions on the flash visualizer (green = read successfully, red = read failed).
- "Read all flash" shortcut: reads entire device flash (chunked, with progress).
- Export: download read data as binary or Intel HEX.
- Target must be connected; button disabled otherwise.

#### 5.4 UI Streamlining
Current issues:
- Long event log clutters the page.
- Connection and firmware sections are both always visible.
- No visual distinction between "connected" and "not connected" states.

**Work**:
- Collapse event log to last 5 lines; expand on click.
- Tab bar: **Flash** | **Verify** | **Memory** | **RTT** | **UART** | **Info**. Show tabs when connected, hide when not.
- Connection panel: sticky top bar showing probe name + target name + status LED (green/red).
- Progress bar replaces inline percent messages.
- Dark/light theme toggle (persist to localStorage).
- Mobile-friendly layout (current layout breaks on narrow screens).

#### 5.5 SWD Multi-Drop (SWD v2 Target Selection)
**Background**: SWD v2 allows addressing specific targets on a shared SWDIO/SWDCLK bus (e.g., nRF5340 app + net cores, or daisy-chained chips). Each target has a unique Target ID read from DPIDR.

**Work**:
- Implement SWD target selection sequence:
  1. Send `JTAG-to-SWD` + `JTAG-to-dormant` sequence to reset all targets to dormant.
  2. Send `DPIDR1` read to activate a specific target ID.
  3. Each target responds only to transfers addressed to it.
- Add to `dap-core.js`: `selectSwdTarget(targetId)`.
- UI: target list populated after scan; multi-core chips show both cores.
- Useful for nRF5340 (app core = 0x6BA02477, net core = 0x6BA00477).

---

## Implementation Order (Suggested)

| Phase | Items | Why |
|-------|-------|-----|
| 1 | 1.1 (DAP_Info), 1.2 (WriteABORT), 3.1 (Recovery) | Quick wins, pure protocol, high utility |
| 2 | 2.1 (Target interface), 2.2 (nRF52832, nRF5340) | Foundation for everything else |
| 3 | 5.1 (Visualizer), 5.2 (Multi-hex), 5.3 (Mem read) | Major UI value, shareable component |
| 4 | 4.1 (RTT) | Firmware debugging — needs target running |
| 5 | 1.3 (Pipelining) | Performance — measure first, then optimize |
| 6 | 5.4 (UI streamlining) | Polish |
| 7 | 1.4 (UART), 5.5 (Multi-drop) | Hardware-dependent, test when ready |

---

## Out of Scope (Researched & Ruled Out)

| Feature | Reason |
|---------|--------|
| SWO/SWV tracing | RP2040/RP2350 lacks SWO hardware. Not implementable in picoprobe regardless of firmware. |
| nRESET via DAP_SWJ_Pins | Pin requires `PROBE_PIN_RESET` compile flag in picoprobe + physical wire to target. Not wired. |
| DAP_ResetTarget (0x0A) | Returns 0 (disabled) in picoprobe. No-op. |
| JTAG | Board uses SWD only. |
