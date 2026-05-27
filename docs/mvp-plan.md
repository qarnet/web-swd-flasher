# Web SWD Flasher MVP Plan

## Product intent

Deliver a minimal browser-native flasher for nRF52840-class targets over USB debug probes, with the fastest path to useful results on nRF52840 DK while preserving a backend architecture that supports CMSIS-DAP next.

## MVP scope

### In scope

1. Connect/disconnect probe from browser UI
2. Detect backend/probe capability
3. Identify target (nRF52840-first)
4. Read core part info from FICR/device IDs
5. Parse Intel HEX
6. Program + verify application flash range
7. Reset/run target
8. Show progress, errors, and operation log

### Out of scope (initial)

- UICR writes
- Full chip erase defaults
- APPROTECT recover
- SoftDevice/bootloader migration logic
- nRF53/nRF54 support
- Multi-image packaging features

## Backend strategy

### Phase order

1. `jlink-webusb` first for fastest hardware value on nRF52840 DK
2. `cmsis-dap` read-only spike early to de-risk long-term path
3. `cmsis-dap` write path after J-Link MVP baseline is stable

### Backend abstraction

Define a backend contract so UI/core logic is probe-agnostic.

Required interface (conceptual):

- `requestDevice(): Promise<void>`
- `connect(): Promise<void>`
- `disconnect(): Promise<void>`
- `getProbeInfo(): Promise<ProbeInfo>`
- `getTargetInfo(): Promise<TargetInfo>`
- `readMemory(addr, length): Promise<Uint8Array>`
- `programImage(image, options): Promise<void>`
- `verifyImage(image, options): Promise<void>`
- `reset(mode): Promise<void>`
- `capabilities(): BackendCapabilities`

Core rules:

- UI never calls transport directly.
- All backend errors map to shared app-level error codes.
- Progress events use one common schema.

## Proposed repository layout

```text
.
├── index.html
├── styles/
│   └── base.css
├── src/
│   ├── app.js
│   ├── core/
│   │   ├── backend-manager.js
│   │   ├── errors.js
│   │   └── progress.js
│   ├── ui/
│   │   ├── state.js
│   │   ├── log-view.js
│   │   ├── device-panel.js
│   │   └── flash-panel.js
│   ├── backends/
│   │   ├── backend-interface.js
│   │   ├── jlink-webusb/
│   │   │   ├── transport.js
│   │   │   ├── client.js
│   │   │   └── flasher.js
│   │   └── cmsis-dap/
│   │       ├── transport-webusb.js
│   │       ├── dap-core.js
│   │       ├── adi.js
│   │       ├── nrf52-target.js
│   │       └── flash-nrf52.js
│   ├── hex/
│   │   ├── intel-hex-parser.js
│   │   └── image-map.js
│   └── nrf/
│       ├── nrf52-memory-map.js
│       └── nrf52-ficr.js
└── docs/
    ├── feasibility.md
    ├── mvp-plan.md
    ├── risk-register.md
    ├── protocol-notes-jlink.md
    └── protocol-notes-cmsis-dap.md
```

## Milestones

## M0 - Project skeleton and UX shell

Deliverables:

- Static app shell and ES module wiring
- Logging/status/progress components
- Runtime checks for WebUSB availability and browser support warning

Exit criteria:

- App loads from local static server
- Connect button flow and state transitions work with mock backend

## M1 - Intel HEX parser and safety preflight

Deliverables:

- Intel HEX parser with record validation
- Segment map visualization (address ranges)
- Overlap/gap handling and bounds checks

Exit criteria:

- Valid HEX files parse deterministically
- Invalid files produce actionable diagnostics

## M2 - Backend interface and mock

Deliverables:

- `backend-interface.js` contract
- `backend-manager.js` capability routing
- Mock backend for deterministic integration tests

Exit criteria:

- UI and core logic run without hardware
- Backend swap requires no UI changes

## M3 - J-Link WebUSB connectivity spike

Deliverables:

- Enumerate/select J-Link compatible device
- Open/claim interface and basic command exchange
- Protocol notes documenting assumptions and observed behavior

Exit criteria:

- Connect/disconnect works on nRF52840 DK (J-Link OB)
- Error cases documented (permission denied, interface claim failure)

## M4 - J-Link WebUSB flash MVP

Deliverables:

- Flash image transfer flow (app region only)
- Verify pass
- Reset/run action

Exit criteria:

- End-to-end flash + verify + reset succeeds on nRF52840 DK
- Progress and errors surfaced clearly

## M5 - Target identification and FICR view

Deliverables:

- Target ID summary panel
- FICR-derived part/variant/revision information where available

Exit criteria:

- Operator can confirm target identity before flashing

## M6 - CMSIS-DAP read-only spike

Deliverables:

- WebUSB transport for CMSIS-DAP probe
- `DAP_Info`, SWD connect, DPIDR read
- Basic nRF52 detect and selected memory reads (FICR)

Exit criteria:

- Read-only flow stable on at least one CMSIS-DAP probe

## M7 - CMSIS-DAP flash path (post-MVP extension)

Deliverables:

- nRF52 page erase/program/verify
- Reset/run integration

Exit criteria:

- Functional parity with J-Link MVP operations for nRF52840 app region

## Risk register (MVP-critical)

1. **Licensing ambiguity (SEGGER path)**
   - Mitigation: do not vendor SEGGER code without explicit license grant; maintain implementation notes and provenance.
2. **Browser support limits**
   - Mitigation: Chromium-only MVP declaration and runtime gate.
3. **Windows driver/interface claim issues**
   - Mitigation: clear diagnostics and probe compatibility notes.
4. **Destructive flashing behavior**
   - Mitigation: app-region-only writes, explicit confirmations, mandatory verify.
5. **Probe diversity and protocol quirks**
   - Mitigation: strict capability detection and backend-specific feature flags.

## Safety policy for MVP

- Never write outside allowed nRF52840 app flash region in MVP.
- Require explicit user confirmation after target identification and image map review.
- Make verify mandatory before reporting success.
- Keep reset behavior explicit (no hidden automatic mass operations).

## Definition of done (MVP)

MVP is complete when all of the following are true:

1. A user can open the static app in a supported Chromium browser.
2. A user can connect to nRF52840 DK over J-Link OB path.
3. A user can load Intel HEX, see mapped ranges, and flash app region.
4. Verify succeeds and reset/run completes.
5. The app logs every critical step and provides actionable failure messages.
6. CMSIS-DAP read-only spike exists as documented technical groundwork.

## Immediate next steps

1. Create `docs/risk-register.md` seeded from this plan.
2. Draft `docs/protocol-notes-jlink.md` with observed interface IDs/endpoints once hardware probing starts.
3. Implement M0 skeleton and mock backend before touching real probe flows.
