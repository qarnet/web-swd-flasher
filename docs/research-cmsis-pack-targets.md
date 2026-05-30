# CMSIS Pack Target Research

**Date**: 2026-05-30  
**Question**: Can we use CMSIS Pack infrastructure to support arbitrary Cortex-M targets in the browser-based SWD flasher?

---

## 1. Resources Researched

### 1.1 cmsis-pack-manager (pyocd)
**URL**: https://github.com/pyocd/cmsis-pack-manager  
**Languages**: Rust core (75.6%), Python bindings (21.9%)  
**Purpose**: Query device database from ARM CMSIS Pack files.

**API surface (Python `Cache` class):**
```python
from cmsis_pack_manager import Cache

a = Cache(True, True)
a.cache_descriptors()                       # download all PDSC metadata
a.index["LPC1768"]                          # per-device dict:
# {
#   "algorithm": { path to FLM, start, size },
#   "memory":    { "IRAM1": { "start": 0x10000000, "size": 0x8000 },
#                  "IROM1": { "start": 0x00000000, "size": 0x80000 } },
#   "debug":     { "svd": "SVD/LPC17xx.svd" },
#   "pdsc_file": "https://www.keil.com/.../NXP.LPC1700_DFP.pdsc",
#   "compile":   { "define": "LPC1768", ... }
# }

a.get_flash_algorthim_binary("LPC1768")     # returns raw FLM bytes
a.get_svd_file("LPC1768")                  # returns SVD XML bytes
```

**Key per-device data:**
- Flash: start address, size
- RAM: start address, size  
- Flash algorithm: FLM file path + which pack it lives in
- Processor core (from PDSC `<processor Dcore="..."/>`)
- SVD debug description

**Practical use**: can drive a build-time script that exports all device metadata to JSON for the browser.

---

### 1.2 CMSIS-Toolbox
**URL**: https://github.com/Open-CMSIS-Pack/cmsis-toolbox  
**Purpose**: CLI tools for embedded build workflows.

**Tools included:**
| Tool | Purpose |
|------|---------|
| `cpackget` | Install/manage CMSIS packs |
| `cbuild` | Build orchestration (wraps CMake) |
| `csolution` | Multi-project manager |
| `packchk` | Validate PDSC pack descriptors |
| `svdconv` | Validate/convert SVD files |
| `cbridge` | External code-generator integration |
| `vidx2pidx` | Generate pack index files |

**Relevance to this project**: Low. Toolbox is for native embedded toolchain workflows, not browser use. `packchk` and `svdconv` could be useful in a build pipeline for validating extracted device data, but are not needed at runtime.

---

### 1.3 Open-CMSIS-Pack Specification
**URL**: https://open-cmsis-pack.github.io/Open-CMSIS-Pack-Spec/main/html/index.html  
**Purpose**: Defines the pack format, device description schema, and flash algorithm ABI.

#### Pack format
- Distribution: ZIP archive renamed `.pack`
- Metadata: PDSC file (XML) at root of ZIP
- Actual content: source code, binaries, FLM files, SVD files, documentation

#### Device description (PDSC XML)
```xml
<family Dfamily="STM32F4" Dvendor="STMicroelectronics:13">
  <processor Dcore="Cortex-M4" DcoreVersion="r0p1" Dfpu="FPU" Dclock="168000000"/>
  <device Dname="STM32F407VG">
    <memory name="IROM1" access="rx"  start="0x08000000" size="0x100000" startup="1"/>
    <memory name="IRAM1" access="rwx" start="0x20000000" size="0x20000"/>
    <algorithm name="Flash/STM32F4xx_1024.flm"
               start="0x08000000" size="0x100000" default="1"/>
  </device>
</family>
```

#### Flash Algorithm ABI (FLM files)
FLM = position-independent ARM Thumb-2 ELF binary compiled with PIC flags.  
Mandatory exported C functions:
```c
int  Init(unsigned long adr, unsigned long clk, unsigned long fnc);
int  UnInit(unsigned long fnc);
int  EraseSector(unsigned long adr);
int  ProgramPage(unsigned long adr, unsigned long sz, unsigned char *buf);
// Optional:
int  EraseChip(void);
int  BlankCheck(unsigned long adr, unsigned long sz, unsigned char pat);
unsigned long Verify(unsigned long adr, unsigned long sz, unsigned char *buf);
```

The algorithm also contains a `FlashDevice` struct at a fixed offset that describes:
- Device name, type
- Flash start address + total size  
- Page size (optimal write unit, often 256 or 512 bytes)
- Sector layout: array of `{size, address}` pairs (supports non-uniform sectors)
- Per-operation timeouts

**Execution model**: The host (debugger) uploads the FLM binary to target RAM, then calls each function by:
1. Halting the CPU via SWD/CoreSight
2. Setting PC + argument registers (r0–r3) via DCRSR/DCRDR
3. Setting LR to a breakpoint address
4. Resuming CPU
5. Polling DHCSR until halt (breakpoint hit = function returned)
6. Reading r0 for return value

This is exactly how pyOCD, OpenOCD, and Keil MDK program flash on arbitrary targets.

---

## 2. Feasibility Assessment for This Project

### 2.1 What we need vs. what CMSIS packs provide

| Need | Provided by packs |
|------|------------------|
| Flash start/size per device | ✓ `<memory name="IROM1">` |
| RAM start/size per device | ✓ `<memory name="IRAM1">` |
| Flash page/sector sizes | ✓ in `FlashDevice` struct inside FLM |
| Flash algorithm code | ✓ FLM binary in pack |
| Processor core type | ✓ `<processor Dcore="..."/>` |
| Debug registers (SVD) | ✓ SVD file in pack |

### 2.2 Two separate goals

**Goal A — Device metadata database (Easy)**  
Use pyocd cmsis-pack-manager in a build-time script to export ~10k device entries as JSON. Each entry: name, flash start/size, RAM start/size, FLM path, pack URL. Bundle into `src/targets/cmsis-device-db.js` or fetch on demand. No browser-side pack parsing needed.

**Goal B — Generic flash via FLM execution (Hard, but achievable)**  
At flash time: fetch the device's pack ZIP from Arm's CDN, extract FLM, upload to target RAM via SWD, and call Init/EraseSector/ProgramPage via CPU halt+set-PC+resume. This gives flash support for any Cortex-M device with a CMSIS pack — thousands of targets.

### 2.3 What already exists in this project

| Required capability | Status |
|--------------------|--------|
| SWD/DAP transport (WebHID/WebUSB) | ✓ done |
| Memory read/write (adi.js) | ✓ done |
| CPU halt (DHCSR) | needs verification — dap-cortex.js |
| Register read/write (DCRSR/DCRDR) | needs verification |
| Breakpoint via FPB | not implemented |
| ELF parser (for FLM extraction) | not implemented |
| ZIP parser (pack download) | not implemented |
| Flash agent executor | not implemented |

### 2.4 Effort breakdown

**Phase 1 — Device database (1–2 days)**
1. Build script (Python): use cmsis-pack-manager to export device JSON
2. Add device search UI (filter by vendor/part name)
3. Wire to existing target-registry.js format

**Phase 2 — FLM execution engine (1–2 weeks)**
1. `src/targets/flm-loader.js` — fetch pack ZIP, extract FLM binary
2. `src/targets/elf-parser.js` — parse ARM ELF to get loadable segments + entry points
3. `src/targets/flash-agent.js` — upload FLM to target RAM, set up stack, call functions
4. `src/targets/cpu-control.js` — halt/resume, set PC/SP/LR/r0–r3, read r0, FPB breakpoint
5. Wire into existing flash flow as an alternative to `nvmc-nrf52` programmer

### 2.5 Pack hosting / CORS

CMSIS packs are hosted at `https://www.keil.com/pack/` and vendor mirrors.  
**Problem**: CORS — browser fetch of pack ZIPs may be blocked.  
**Options**:
- CORS proxy (self-hosted or via service worker)
- Pre-extract only the FLM binary at build time and host it ourselves (10–50 KB per device)
- Use a pre-built FLM cache hosted alongside the app

### 2.6 Limitations

- FLM execution requires CPU halt → cannot be used while target firmware runs (same as our current NVMC approach)
- Some flash algos assume specific clock setup (Init() call handles this, but chip must be powered)
- Encrypted/signed flash (e.g. nRF9160, PSA targets) won't work this way
- RTOS-aware flashing not relevant here

---

## 3. Recommendation

**Short term (high value, low risk):**  
Build-time device database from CMSIS packs via pyocd cmsis-pack-manager Python script. Gives immediate multi-target dropdown (thousands of devices) with correct memory maps for flash visualization and address validation. Zero browser-side complexity.

**Long term (game-changer):**  
Implement FLM execution engine. Would make this the only browser-native SWD flasher supporting arbitrary Cortex-M targets. Prior art: pyOCD (Python), probe-rs (Rust) — no browser equivalent exists.

**Recommended implementation order:**
1. CPU halt/resume + register access (prerequisite for FLM; also useful for debugging features)
2. Device database JSON build script
3. ELF parser + FLM loader
4. Flash agent executor
5. Pack fetcher (tackle CORS last — start with locally extracted FLMs)

---

## 4. Reference Links

- Pack index: `https://www.keil.com/pack/index.pidx`
- Arm pack CDN: `https://www.keil.com/pack/`
- FLM format spec: https://open-cmsis-pack.github.io/Open-CMSIS-Pack-Spec/main/html/flashAlgorithm.html
- Device PDSC schema: https://open-cmsis-pack.github.io/Open-CMSIS-Pack-Spec/main/html/pdsc_family_pg.html
- pyocd cache API: https://pyocd.io/cmsis-pack-manager/
- probe-rs FLM impl (Rust reference): https://github.com/probe-rs/probe-rs (flash/src/)
