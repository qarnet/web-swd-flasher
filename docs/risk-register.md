# Web SWD Flasher Risk Register

This register tracks MVP and near-term risks for browser-based nRF flashing over USB debug probes.

## Scale

- Likelihood: Low / Medium / High
- Impact: Low / Medium / High
- Priority: computed qualitatively from likelihood + impact

## Active risks

| ID | Risk | Likelihood | Impact | Priority | Mitigation | Trigger/Signal | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| R-001 | SEGGER licensing ambiguity for reuse of demo/client implementation details | Medium | High | High | Do not vendor SEGGER code/assets without explicit license grant; keep implementation original; maintain provenance notes | Need to copy code/assets from SEGGER source to proceed | Project | Open |
| R-002 | Browser support limited outside Chromium family | High | Medium | High | Declare Chromium-only MVP; runtime capability checks; clear user messaging | User opens app in Firefox/Safari and cannot connect device | Project | Open |
| R-003 | Windows driver binding prevents browser interface claim | High | High | High | Detect and report claim/open failures with actionable guidance; maintain compatibility matrix by probe firmware/OS | `requestDevice` works but `open`/`claimInterface` fails repeatedly | Project | Open |
| R-004 | Destructive flashing from wrong address range or erase policy | Medium | High | High | Restrict MVP writes to vetted nRF52840 app flash range; require explicit confirmation; mandatory verify | Parsed HEX includes out-of-policy address ranges | Project | Open |
| R-005 | Probe diversity causes transport/protocol incompatibility | High | Medium | High | Backend capability flags; strict feature detection; backend-specific diagnostics | Same flow works on one probe, fails on another | Project | Open |
| R-006 | Incomplete J-Link WebUSB protocol understanding blocks non-demo behavior | Medium | Medium | Medium | Treat J-Link backend as MVP-flash path first; document observed protocol behavior; keep interface swappable | Cannot reliably implement identify/read steps with J-Link path | Project | Open |
| R-007 | CMSIS-DAP implementation complexity exceeds initial estimates | Medium | Medium | Medium | Deliver read-only CMSIS-DAP spike before write path; split into transport, DAP core, ADI, flash layers | Repeated refactors across protocol layers | Project | Open |
| R-008 | Weak error taxonomy leads to poor operator recovery | Medium | Medium | Medium | Normalize backend errors into shared codes/messages; include probable cause + next action per error | Users cannot distinguish permission/driver/target-lock failures | Project | Open |
| R-009 | Interrupted USB session during erase/program leaves unknown target state | Medium | High | High | Write in verified chunks; detect partial completion; require explicit retry flow; always re-read target state after reconnect | Disconnect or transfer timeout during flash sequence | Project | Open |
| R-010 | Target protection states (for example APPROTECT) block expected flows | Medium | Medium | Medium | Detect lock/protection early and provide explicit unsupported-path messaging for MVP | Connect succeeds, memory operations fail with protection faults | Project | Open |
| R-011 | Browser automation cannot reliably control chooser flows in selected mode | Medium | Medium | Medium | Standardize on Puppeteer + headed Chrome (or `xvfb-run`), fail fast on true headless mode, keep smoke test for chooser event | E2E test cannot observe/select device prompt | Project | Open |

## Deferred risks (post-MVP)

| ID | Risk | Notes |
|---|---|---|
| D-001 | UICR writes can permanently alter boot/reset behavior | Keep out of MVP until explicit safety UX and recovery docs exist |
| D-002 | Full chip erase may destroy expected on-device assets | Keep disabled by default; require explicit mode selection later |
| D-003 | Multi-core targets (nRF53/nRF54) add reset/debug complexity | Defer until nRF52 path is stable and tested |

## Review cadence

- Review at each milestone boundary (M0..M7).
- Update likelihood/impact/status based on real hardware findings.
- Promote deferred risks to active when corresponding scope is scheduled.

## Immediate actions

1. Create a probe/browser compatibility matrix once first hardware tests begin.
2. Add explicit address-policy checks in design before flash backend implementation.
3. Define shared error codes and UI mapping before M3 backend integration.
4. Stand up Puppeteer smoke test early (M0.5) to validate chooser flow before protocol implementation.
