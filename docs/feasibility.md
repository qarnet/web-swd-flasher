# Web SWD Flasher Feasibility Assessment

## Goal and constraints

This project targets browser-based flashing of Nordic nRF devices over USB debug probes, with initial focus on nRF52840 DK and a browser-native architecture:

- Static HTML + ES modules
- No framework
- No bundler unless later justified
- Minimal, inspectable modules

This is separate from BLE DFU and bootloader-mediated DFU.

## Feasibility summary

Overall feasibility is **good** if scope is controlled:

1. Chromium-based browsers can support direct USB access via WebUSB.
2. nRF52840 application flashing is practical with either:
   - A SEGGER J-Link OB path (`jlink-webusb`) for fastest time-to-value, or
   - A CMSIS-DAP path (`cmsis-dap`) for open, portable long-term control.
3. A clean backend abstraction can support both without major rework.

Main constraints are browser support, host driver binding behavior, protocol/documentation gaps on J-Link WebUSB details, and safety around destructive flash operations.

## Test automation feasibility

A browser-automation path is feasible and should be part of the MVP plan.

- Use Puppeteer with a real Chrome instance (not true headless mode) to drive DOM actions and capture native device-picker events.
- This approach is already proven in a similar project (`~/repos/web-bluetooth-dfu`) where browser permission flows are exercised end-to-end.
- Chrome DevTools MCP is useful for inspection but not sufficient for this project because it cannot operate the native chooser flow required for permissioned USB device selection.

Operational implication:

- Test jobs should run with a headed Chrome session, optionally under `xvfb-run` on machines without a display.

## Backend direction 1: SEGGER J-Link WebUSB (`jlink-webusb`)

### What appears feasible

SEGGER's public material indicates J-Link OB models with WebUSB support can flash `hex/mot/bin` from browser context, intended as a cross-platform alternative to drag-and-drop MSD programming.

This suggests a viable MVP path for:

- Connect to compatible J-Link OB
- Submit firmware image
- Program target
- Observe progress/result

### What is uncertain

- Public, stable, low-level protocol details are limited.
- The public demo strongly implies a firmware-update workflow, but not necessarily a general, documented SWD register/memory API.

### Licensing posture

- Do not vendor SEGGER code/assets unless license terms explicitly permit redistribution and your intended use.
- Preferred approach: independent implementation based on public protocol behavior and documentation, with strict separation from non-permissive code.

### MVP impact

Very good for quick success on nRF52840 DK hardware with J-Link OB.

## Backend direction 2: CMSIS-DAP (`cmsis-dap`)

### What appears feasible

CMSIS-DAP is a suitable long-term backend for portable SWD control from browser (when probe/browser/driver combination permits WebUSB/WebHID access).

Expected capabilities with staged implementation:

- Probe connect + identify (`DAP_Info`)
- SWD attach and target detect (DP/AP ID reads)
- Memory read/write
- Flash algorithm sequence (erase/program/verify)
- Reset/run control

### Complexity notes

Compared to J-Link WebUSB MVP, this path has more protocol surface:

1. CMSIS-DAP command framing/transport behavior
2. ADIv5 DP/AP transaction layer
3. Target-specific flash control (nRF52 NVMC and memory map)
4. Robust error handling (timeouts, WAIT/FAULT, reconnect)

### Reference and licensing posture

- pyOCD (Apache-2.0): strong behavioral reference for sequencing and state machine concepts.
- DAPjs (MIT): useful reference for JS transport layering and command usage patterns.
- OpenOCD (GPL-2.0-or-later): avoid as MVP implementation base to keep licensing/simple architecture risk low.

### MVP impact

Best strategic backend, but slower to first end-to-end flashing result than J-Link WebUSB.

## Browser and platform feasibility

### Browser support

- Primary target: Chromium-based browsers (Chrome/Edge class).
- Non-target for MVP: Firefox/Safari due to lack of practical WebUSB support.

### Security model implications

- HTTPS or `localhost` secure context required.
- User gesture required for `requestDevice()`.
- Per-origin device permission model requires explicit connection UX.

### Windows/driver binding caveat

Whether browser can claim the needed USB interface depends on driver ownership and interface exposure. This is probe/firmware/OS dependent and must be validated on target hardware.

## Target scope feasibility for nRF52840 MVP

The following initial capability set is feasible and appropriately scoped:

1. Connect to probe
2. Identify target
3. Read FICR/part metadata
4. Parse Intel HEX
5. Erase/program/verify application flash
6. Reset/run target

Out-of-scope initially:

- UICR modifications
- Full chip erase defaults
- APPROTECT recover flows
- nRF5340/nRF54 family support
- SoftDevice/bootloader-specific workflow logic

## Major risks

### Licensing and IP risk

1. SEGGER demo/protocol implementation details may not be licensed for reuse.
2. GPL implications if OpenOCD code is embedded/ported.

Mitigation:

- Keep code original.
- Rely on permissive references (pyOCD, DAPjs concepts).
- Maintain a third-party notices file if/when external code is included.

### Browser compatibility risk

Only Chromium-family is realistic for MVP.

Mitigation:

- Explicit browser support matrix in docs and UI.
- Early runtime checks with clear user messaging.

### Driver/USB interface access risk

Some probes may expose interfaces that are unavailable to browser due to host binding.

Mitigation:

- Probe capability detection at connect time.
- Actionable diagnostics for common failure modes.

### Destructive flashing risk

Incorrect address mapping or erase scope can damage device state.

Mitigation:

- Restrict MVP writes to vetted nRF52840 application flash ranges.
- Add confirmation gates and clear warnings.
- Default to non-destructive behavior.

### Operational robustness risk

USB disconnects, partial writes, and target lock states can produce hard-to-debug failures.

Mitigation:

- Consistent error taxonomy.
- Idempotent reconnect/reset workflow.
- Verify-after-program as mandatory in MVP.

## Recommendation

Use a two-track strategy:

1. **Primary MVP path:** `jlink-webusb` to deliver end-user value quickly on nRF52840 DK.
2. **Strategic path:** begin `cmsis-dap` read-only spike in parallel, then promote to flash backend once stable.

This gives fast validation without locking architecture to a single vendor path.

## Sources reviewed

- SEGGER KB: J-Link WebUSB overview and requirements
- SEGGER public WebUSB update demo page
- WICG WebUSB specification
- Chromium WebUSB documentation
- Can I use: WebUSB support matrix
- DAPjs repository and license (MIT)
- pyOCD repository and license (Apache-2.0)
- OpenOCD licensing statement (GPL-2.0-or-later)
- `~/repos/web-bluetooth-dfu/TESTING.md` (Puppeteer + native chooser workflow)
- `~/repos/web-bluetooth-dfu/tools/browser-dfu-test.mjs` (automation pattern and flags)
