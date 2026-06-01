# web-swd-flasher — Test Plan

## Architecture Decision: Direct Protocol (No Puppeteer)

Test the protocol stack directly from Node.js, not through a browser. The
existing `tools/node-probe-transport.mjs` already provides a real transport
that plugs into `CmsisDapCore` from Node.js. UI modules (`src/ui/*.js`) are
thin DOM wrappers — the real logic worth testing lives in the protocol layer.

**Why not Puppeteer:**
- Protocol code (`dap-core`, `adi`, `flash-nrf52`, `recovery`, `cortex`,
  `rtt-client`, `dap-uart`, `dap-swo`) has zero browser dependencies
- Puppeteer is slow, flaky, and can't initiate USB device selection headlessly
- Existing Puppeteer tests (`browser-smoke.mjs`, `browser-tests.mjs`) cover
  UI smoke; they remain as a separate concern

---

## Two-Tier Test Structure

```
tools/
  tests/
    helpers/                          ← Shared fakes/fixtures
      fake-transport.mjs             (pre-queued responses for unit tests)
      fake-core.mjs                  (CmsisDapCore mock for ADI-layer unit tests)
      fake-adi.mjs                   (Map-backed memory for higher-level unit tests)
      make-image.mjs                 (build test images for flash/verify)
    *.test.mjs                        ← Unit tests (existing + new)
    hitl/                             ← Hardware-in-the-loop tests
      probe.mjs                      (shared: open probe, connect SWD, teardown)
      flags.mjs                       (--flash-test, --recovery-test, --verbose)
      probe-info.test.mjs            (T1: DAP_Info, packet size)
      swd-connect.test.mjs           (T2: connect, DPIDR, CTRL/STAT)
      target-detection.test.mjs      (T3: FICR, detectTarget, nRF52 identity)
      memory-access.test.mjs         (T4: RAM r/w, block, 1KB boundary)
      uicr-read.test.mjs             (T3: all UICR registers)
      protection.test.mjs            (T3: checkProtection)
      cortex-debug.test.mjs          (T5: halt/resume/step/regs)
      flash-program.test.mjs         (T6: erase page, program, verify)
      rtt-loopback.test.mjs          (T6: flash RTT firmware → reset → read RTT output)
      recovery.test.mjs              (T7: eraseAll if locked, re-program)
  test-fixtures/                      ← Test data files
    rtt-test-nrf52840.hex            (RTT-verified test firmware — built from Zephyr)
```

---

## Test Firmware: RTT-Verified Blink

A minimal Zephyr app that provides closed-loop verification:

1. Initializes SEGGER RTT (1 up channel, default "Terminal" buffer)
2. Prints `"RTT-TEST-READY\n"` once at boot
3. Optionally blinks an LED (visual confirmation for humans)
4. Optionally prints `"tick N\n"` every second

**Feedback loop**: Flash → Reset → RTT search → find control block →
start polling → read `"RTT-TEST-READY"` → pass.

Build once with Zephyr, commit the `.hex` to `tools/test-fixtures/`.
Should be small (~5-10KB with RTT buffer), no SoftDevice dependency.

### Building the test firmware

```bash
# From an NCS/Zephyr workspace:
west init -m https://github.com/zephyrproject-rtos/zephyr.git
cd zephyr
west update

# Create a minimal app with RTT:
cat > samples/rtt-test/main.c << 'EOF'
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <SEGGER_RTT.h>

int main(void)
{
    SEGGER_RTT_Init();
    SEGGER_RTT_WriteString(0, "RTT-TEST-READY\n");

    int tick = 0;
    while (1) {
        k_sleep(K_SECONDS(1));
        char buf[32];
        int len = snprintk(buf, sizeof(buf), "tick %d\n", tick++);
        SEGGER_RTT_Write(0, buf, len);
    }
    return 0;
}
EOF

# Build for nRF52840 DK (pca10056):
west build -b nrf52840dk_nrf52840 samples/rtt-test -- -DCONFIG_USE_SEGGER_RTT=y
# Output: build/zephyr/zephyr.hex
# Copy to: tools/test-fixtures/rtt-test-nrf52840.hex
```

---

## HIL Test Tiers (Ascending Destructiveness)

### Tier 1 — Probe only (no target needed)

| Test | What | Destructive? |
|------|------|-------------|
| DAP_Info returns valid caps | `dapInfo()` returns truthy object | No |
| Packet size >= 64 | `transport.packetSize >= 64` | No |

### Tier 2 — SWD connection (target must be powered)

| Test | What | Destructive? |
|------|------|-------------|
| connect() returns valid DPIDR | DPIDR bit 0 = 1, non-zero, non-FFFFFFFF | No |
| CTRL/STAT power acks set | CSYSPWRUPACK + CDBGPWRUPACK = 0xA0000000 | No |

### Tier 3 — Register reads (non-destructive)

| Test | What | Destructive? |
|------|------|-------------|
| FICR CODEPAGESIZE = 4096 | `readMem32(FICR+0x10) = 4096` | No |
| FICR part looks like nRF52 | `readMem32(FICR+0x100)` matches nRF52xxx | No |
| NVMC_READY = 1 at idle | `readMem32(0x4001e400)` | No |
| UICR: all 17 registers readable | Each UICR reg read succeeds | No |
| checkProtection returns valid status | locked/unlocked status | No |
| FICR variant non-zero | Variant code present | No |
| detectTarget matches nRF52840 | `detectTarget(adi)` returns nRF52840 entry | No |

### Tier 4 — RAM read/write (non-destructive to flash)

| Test | What | Destructive? |
|------|------|-------------|
| Single word write/read-back | `writeMem32` + `readMem32` round-trip | No (RAM) |
| Block write/read-back (14 words) | `writeMemBlockFast` + `readMemBlockFast` | No (RAM) |
| Block write spanning 1KB boundary | TAR auto-increment boundary handling | No (RAM) |
| readMemBlockFast full chunk | Read max block size word count | No (RAM) |
| writeMem32 at non-zero AP select | Verify AP select restore works | No (RAM) |

### Tier 5 — Cortex debug (halts CPU briefly)

| Test | What | Destructive? |
|------|------|-------------|
| Halt then resume | `halt()` → `isHalted()=true` → `resume()` → `isHalted()=false` | Brief halt |
| Single step | `halt()` → `step()` → `isHalted()=true` | Brief halt |
| Read all core registers | `readCoreRegs()` — 17 regs, SP in RAM range | Brief halt |
| Halt/resume preserves RAM | Write sentinel to RAM, halt+resume, verify intact | Brief halt |

### Tier 6 — Flash program + verify (destructive, gated behind `--flash-test`)

| Test | What | Destructive? |
|------|------|-------------|
| Erase single page, verify 0xFFFFFFFF | `erasePage(0x26000)` → read-back | Yes |
| Program small image, verify match | `programImage(blink_hex)` → `verifyImage()` | Yes |
| Full workflow: program → verify → reset | Program, verify, SYSRESETREQ, target runs | Yes |
| Verify mismatch detection | Program image, corrupt one word, verify fails | Yes |
| RTT loopback: flash → reset → read RTT | Flash RTT firmware, reset, search RTT CB, read magic string | Yes |

### Tier 7 — Recovery (most destructive, gated behind `--recovery-test`)

| Test | What | Destructive? |
|------|------|-------------|
| Mass erase if locked | `checkProtection` → if locked, `eraseAll` → verify unlocked | Very |
| Re-program after mass erase | eraseAll → program blink → verify matches | Very |

---

## Shared Helpers

### `fake-transport.mjs`

Pre-queued response transport for unit tests. Implements the same
`open/close/write/read/packetSize` interface as real transports.

```javascript
export class FakeTransport {
  constructor(responses = [], packetSize = 64) {
    this.packetSize = packetSize;
    this._responses = responses; // Array of Uint8Array
    this._queue = [...responses];
    this._written = [];           // captured write payloads
  }
  async open() {}
  async close() {}
  async write(payload) { this._written.push(payload); }
  async read() {
    if (this._queue.length === 0) throw new Error("FakeTransport: read queue empty");
    return this._queue.shift();
  }
  get lastWrite() { return this._written[this._written.length - 1]; }
}
```

### `fake-core.mjs`

Wraps FakeTransport to provide a `CmsisDapCore`-like interface for ADI-layer
unit tests. Delegates `readDp`, `writeDp`, `transfer`, `transferMultiple`,
`transferBlockRead`, `transferBlockWrite` to pre-queued responses.

### `fake-adi.mjs`

Map-backed memory model for flash programmer and recovery unit tests.
Implements `readMem32`, `writeMem32`, `readMemBlockFast`, `writeMemBlockFast`,
`selectAp`, `readAp`, `writeAp`, `reconnectSwd`. NVMC_READY always returns 1.
Tracks all write calls for assertion.

### `make-image.mjs`

Builder for test images in the parsed hex format consumed by
`Nrf52FlashProgrammer.programImage()`:

```javascript
export function makeImage(addressByteMap) {
  // addressByteMap: Map<addr, byteValue> or { 0x26000: 0x11, ... }
  // Returns: { byteCount, addresses: [], data: Map }
}
```

---

## Unit Test Coverage Gaps

Existing unit tests cover: `dap-core`, `adi-session`, `nrf52-flash`,
`nrf52-recovery`, `nrf52-ficr`, `target-registry`, `intel-hex-parser`,
`multi-hex-merger`, `rtt-client`, `backend-manager`.

### New unit tests to add

| File | Tests |
|------|-------|
| `dap-cortex.test.mjs` | `readRegister`, `readCoreRegs` with FakeAdi; verify DCRSR/DCRDR protocol |
| `dap-uart.test.mjs` | Command encoding (`setTransport`, `configure`, `control`, `status`, `transfer`); `open`/`close` flow with FakeCore |
| `dap-swo.test.mjs` | Command encoding (`setTransport`, `setMode`, `setBaudrate`, `setControl`, `status`, `readData`); `open`/`close` flow |
| `nrf52-memory-map.test.mjs` | `validateAppRange` for app/full/uicr modes; boundary conditions |
| `image-map.test.mjs` | `buildImageMap`, `formatImageMap`; contiguous segments, gaps |
| `errors.test.mjs` | `normalizeError` with Error objects, string errors, DAP errors |

### Refactor existing tests to use shared helpers

Current tests each define their own inline `FakeTransport`/`FakeCore`/`FakeAdi`.
After creating `helpers/`, refactor to import from shared modules to reduce
duplication and improve maintainability.

---

## HIL Shared Harness

### `hitl/probe.mjs`

```javascript
import { openProbeTransport } from "../../node-probe-transport.mjs";
import { CmsisDapCore } from "../../../src/backends/cmsis-dap/dap-core.js";
import { AdiSession } from "../../../src/backends/cmsis-dap/adi.js";

let probeResult = null;
let core = null;
let adi = null;

export async function openProbe(verbose = false) {
  const logger = verbose ? (msg) => console.log(`  [dap] ${msg}`) : null;
  probeResult = await openProbeTransport(logger);
  core = new CmsisDapCore(probeResult.transport, 1_000_000);
  adi = new AdiSession(core);
  const { dpidr } = await core.connect();
  return { transport: probeResult.transport, core, adi, dpidr };
}

export function getProbe() {
  return { transport: probeResult?.transport, core, adi };
}

export async function teardown() {
  if (probeResult) {
    await probeResult.transport.close().catch(() => {});
    probeResult = null;
    core = null;
    adi = null;
  }
}

// Call in process.on("exit") for cleanup
```

### `hitl/flags.mjs`

```javascript
export const VERBOSE = process.argv.includes("--verbose");
export const FLASH_TEST = process.argv.includes("--flash-test");
export const RECOVERY_TEST = process.argv.includes("--recovery-test");

export function skipReason(flag, flagName) {
  return flag ? null : `pass --${flagName} to enable`;
}
```

---

## Execution Commands

```makefile
# Unit tests only (no hardware)
test:
    npm --prefix tools run test

# HIL tests (non-destructive tiers only — skips flash/recovery)
hitl:
    node --test tools/tests/hitl/*.test.mjs

# HIL tests including flash programming
hitl-flash:
    node --test tools/tests/hitl/*.test.mjs --flash-test

# HIL tests including recovery (mass erase)
hitl-recovery:
    node --test tools/tests/hitl/*.test.mjs --recovery-test

# HIL tests including everything
hitl-all:
    node --test tools/tests/hitl/*.test.mjs --flash-test --recovery-test
```

All HIL tests auto-skip if no probe is found, so they are safe to run
on any machine. Destructive tests (flash, recovery) additionally require
explicit flags.

---

## Implementation Order

| Step | Items | Depends on |
|------|-------|------------|
| 1 | Create `helpers/` (fake-transport, fake-core, fake-adi, make-image) | Nothing |
| 2 | Refactor existing unit tests to use shared helpers | Step 1 |
| 3 | Write new unit tests (dap-cortex, dap-uart, dap-swo, nrf52-memory-map, image-map, errors) | Step 1 |
| 4 | Create HIL harness (`hitl/probe.mjs`, `hitl/flags.mjs`) | Nothing |
| 5 | Port `hardware-test.mjs` into `hitl/` (probe-info, swd-connect, target-detection, memory-access) | Step 4 |
| 6 | Write remaining HIL tests (uicr, protection, cortex-debug, flash-program, recovery) | Step 4 |
| 7 | Build RTT test firmware, write `rtt-loopback.test.mjs` | Zephyr/NCS |
| 8 | Update `Makefile` and `tools/package.json` scripts | Steps 1-7 |
| 9 | Delete `tools/hardware-test.mjs` | Step 5 |

---

## Key Design Decisions

- **Direct protocol, no Puppeteer** — test the stack from `CmsisDapCore` up,
  not from the UI down
- **No source changes needed** — HIL tests construct core/adi/flash manually
  (like existing `hardware-test.mjs`). Backend dependency-injection refactor
  is a separate follow-up.
- **Graceful skip** — all HIL tests auto-skip if no probe; flash/recovery gated
  behind flags
- **RTT closed loop** — flash test firmware prints via RTT → we read it →
  strongest possible verification that flash + reset + boot worked
- **`node:test` throughout** — consistent with existing pattern, zero
  additional test dependencies
- **Test fixture as committed hex** — no build step required at test time;
  firmware hex is committed to the repo

## Deleted Files

| File | Replaced by |
|------|-------------|
| `tools/hardware-test.mjs` | `tools/tests/hitl/` suite (probe-info, swd-connect, target-detection, memory-access) |