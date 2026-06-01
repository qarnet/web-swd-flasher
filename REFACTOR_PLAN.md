# Refactor Plan — Test Coverage Focus

Status: post-Phase-E. Phases A (bugs), B (bus unification), C (backend layering), D (backend registry), E (UI cohesion) mostly landed — `app.js` is down to 188 lines, `ProgressBus` is gone, `MockBackend` is wired, USB-disconnect is handled, `BasePanel` collapses panel boilerplate, `escape-html`/`intel-hex-encoder`/`persist-input`/`tab-controller`/`topbar-build-badge` are extracted. Phase F (tests) is the main outstanding work.

`npm test` reports 152 cases (150 pass / 2 skip / 0 fail). Coverage is still **0%** for every UI panel, the visualizer, the serial layer, the JLink backend, and most of the new helpers. This file enumerates exactly which tests are missing, what each one should assert, and the order to land them. Already-applied items from earlier plans are removed.

---

## 1. Test inventory — what's missing

### 1.1 Untested source files (27)

Grouped so an agent can pick a batch and finish it:

**Pure helpers — fastest wins, no DOM needed**
- `src/hex/intel-hex-encoder.js` — `buildIntelHex(addr, bytes)` round-trip + checksum.
- `src/ui/components/escape-html.js` — `escHtml` for `& < > "` and unaffected chars.
- `src/ui/components/persist-input.js` — localStorage roundtrip with a fake `el` + fake `localStorage`.
- `src/ui/components/topbar-build-badge.js` — `renderBuildTimestamp` for placeholder string, malformed string, valid ISO.
- `src/ui/ansi-renderer.js` — SGR state machine, mid-escape split via `_pending`, `plainText` accumulator.
- `src/backends/backend-registry.js` — known names succeed; unknown throws; deps thread through.

**Core glue — small surfaces, mockable**
- `src/core/serial-manager.js` — `connect` emits on bus, `disconnect` is idempotent, `send` rejects when no port.
- `src/backends/serial/web-serial-uart.js` — `requestPort`/`open`/`send`/`close` against a fake `navigator.serial`.
- `src/backends/cmsis-dap/transport-webusb.js` — `withQuiet` save/restore (regression vector), cached-device path in `requestDevice`, claim-failure → `diagnoseClaimFailures` call.

**JLink stub — surface assertions only**
- `src/backends/jlink-webusb/backend.js` — `capabilities()` matches stub (`supportsReadMemory: false`), `getProbeInfo` shape, `readMemory` throws.
- `src/backends/jlink-webusb/client.js` — `ping` placeholder shape.
- `src/backends/jlink-webusb/flasher.js` — program/verify/reset all emit `FLASH_PROGRESS` with `percent: 100`.
- `src/backends/jlink-webusb/transport.js` — `requestDevice` filter set, claim/release symmetry.

**Visualizer — caught a real bug, needs a guard**
- `src/ui/flash-visualizer.js` — `renderFlashVisualizer` produces SVG with named regions, with read regions, with off-flash segments, and (the regression test that catches the original `named`-undefined bug) with a target descriptor where `namedRegions.length > 0`.

**Logger / log helpers — DOM-light**
- `src/ui/logger.js` — verbose toggle gates `logVerbose`; `setStatus` writes status + appends log line; reset between inits.
- `src/ui/log-panel-helpers.js` — `downloadLog` triggers `URL.createObjectURL` (mockable); `autoScrollObserver` scrolls only when checkbox checked.

**Components**
- `src/ui/components/tab-controller.js` — `TabController.switchTo` toggles `.active` + `panel.hidden`; `ModeController` shows/hides per `data-mode`.
- `src/ui/panels/base-panel.js` — `_bindBusListener` returns are tracked; `_teardown()` releases everything; double `_teardown()` is safe; manual `addEventListener` not bound via `_bindDomListener` is left alone.

**Panels (9, the largest gap)** — covered in §1.3.

### 1.2 Thin tests that need filling out

- `tools/tests/cmsis-dap-core.test.mjs` — two `{ skip: "needs full connect mock sequence" }` cases. Build the scripted `FakeTransport.read()` queue and unskip:
  - `cmsis-dap connect sends setup commands` — assert `DAP_Connect`, `DAP_SWJ_Clock`, `DAP_TransferConfigure`, `DAP_SWJ_Sequence` issued in order.
  - `cmsis-dap transfer retries wait/noack` — script three WAIT responses then OK; assert final result and retry count.
- `tools/tests/panel-logger.test.mjs` — covers `log`/`clear`/`lines` but not the `eventBus` parameter (still dead — see §2.6). Either implement and test bus bridging, or delete the param and update the signature.
- `tools/tests/backend-manager.test.mjs` — only tests `setBackend("cmsis-dap")`. Add `setBackend("mock")`, `setBackend("jlink-webusb")`, and `setBackend("nope")` (must throw). Assert deps (bus, logger, swdClockHz) reach the constructor.
- `tools/tests/backend-interface.test.mjs` — covers `getMemoryAccess`/`createRttSession`/`activeTarget`/`availableTargets`/`capabilities`. Add `getCortex() === null`, `getRecovery() === null`, `withQuietLog(fn)` returns `fn()` unchanged.
- `tools/tests/mock-backend.test.mjs` — covers `getMemoryAccess`/`createRttSession`/`capabilities`. Add: `activeTarget` is nrf52840 (A14 invariant), `availableTargets` returns `TARGETS`, `getCortex() === null`, `getRecovery() === null`, `programImage` emits 3 progress events with monotonically increasing `percent`.

### 1.3 Panel test matrix

Every panel class is testable in `node --test` against a DOM polyfill. Suggested per-panel cases — these are the critical paths; each panel test file should land in one commit.

| File | Class | Cases |
|---|---|---|
| `tools/tests/swd-recovery-panel.test.mjs` | `SwdRecoveryPanel` | mount asserts disabled; `BACKEND_CONNECTED` enables; `_onCheck` happy path + error path; `_onCheck` short-circuits when `getRecovery()` is null; `_onRecover` confirm-cancel skips backend call; `unmount` releases listeners (assert via `bus.on/.off`). |
| `tools/tests/swd-uicr-panel.test.mjs` | `SwdUicrPanel` | connected → `_onRead` loops over `UICR_REGS` calling `readMem32` per entry; dump format matches fixture; error path renders `normalizeError(...).message`. |
| `tools/tests/swd-debug-panel.test.mjs` | `SwdDebugPanel` | each button (halt/resume/step/regs) hits the right `backend.*` method; reg dump formatting; error path; buttons disabled on `BACKEND_DISCONNECTED`. |
| `tools/tests/swd-memory-panel.test.mjs` | `SwdMemoryPanel` | `_parseHexInput` (hex + dec + invalid); `_formatHexDump` byte-for-byte vs fixture (16-byte / partial-tail rows); `_onRead` writes to `readRegions`; `_onReadAllFlash` uses `withQuietLog`, emits `BACKEND_PROGRESS`, falls back when backend has no `withQuietLog`; `_exportHex` filename + `buildIntelHex` integration round-trip via `parseIntelHexFileText`. |
| `tools/tests/swd-rtt-panel.test.mjs` | `SwdRttPanel` | search success uses `upChannelCount`/`downChannelCount` accessors; search not-found; search error; start/stop button toggling; `_onSend` writes channel 0; `BACKEND_DISCONNECTED` stops client and disables buttons. |
| `tools/tests/swd-firmware-panel.test.mjs` | `SwdFirmwarePanel` | `_mergeAndUpdate` zero / one / conflict / empty-merge branches each emit `IMAGE_CHANGED` with the right payload; `_updateButtons` matrix against `capabilities()` × confirm-checkbox × image-ready; program→verify→reset chain stops on first failure; `_renderFileList` escapes filenames (uses `escHtml`); remove-button removes the right file. |
| `tools/tests/swd-connection-panel.test.mjs` | `SwdConnectionPanel` | `_populateTargetSelector` skips `generic`; `_onConnect` happy path emits `BACKEND_CONNECTED` with `{ backend }`; `_onConnect` failure does NOT emit; `_onBackendChanged` while connected forces disconnect; USB-disconnect path emits `BACKEND_DISCONNECTED` and resets LED/topbar; clock change persists via `persistInput`. |
| `tools/tests/serial-connection-panel.test.mjs` | `SerialConnectionPanel` | `checkCompatibility` HTTPS / supported-flag branches; `_onConnect` emits `SERIAL_CONNECTED` + `LOG_LINE`; `_onConnect` `NotFoundError` path does not emit error log; `onUnexpectedDisconnect` emits with `unexpected: true`; baud selector roundtrips through `localStorage`. |
| `tools/tests/serial-terminal-panel.test.mjs` | `SerialTerminalPanel` | `SERIAL_DATA` bytes → ansi-rendered text in `termLog`; `SERIAL_CONNECTED` resets `_firstChunk`; first chunk after connect prepends `\n`; `_onSend` appends CRLF + clears input; `_onClear` resets renderer. |

### 1.4 Integration / smoke

- `tools/browser-smoke.mjs` exists but is not referenced from `package.json` scripts in any visible README. Either add it to `npm test` (separate suite) or document the `npm run browser-smoke` invocation.
- `tools/browser-tests.mjs` and `tools/browser-test-suite.mjs` are present and have `npm run browser-tests`; their pass/fail isn't gated. Wire them into CI (see §1.6) once a workflow exists.
- HitL tests (`tools/tests/hitl/`) are flag-gated through `flags.mjs`; the gating UX is undocumented. Add a one-paragraph note in `tools/README.md` (or root README) so contributors don't run hardware suites by accident.

### 1.5 Cross-cutting test infrastructure

Before writing any panel test, add:

1. `tools/package.json` dev dependency: `linkedom` (or `happy-dom` — `linkedom` is lighter and pure ESM, recommended).
2. `tools/tests/helpers/dom.mjs`:
   ```js
   import { parseHTML } from "linkedom";
   export function makeDom(html) {
     const { window } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
     globalThis.window = window;
     globalThis.document = window.document;
     globalThis.localStorage = window.localStorage;
     globalThis.navigator = window.navigator;
     globalThis.TextEncoder = TextEncoder;
     globalThis.TextDecoder = TextDecoder;
     return window;
   }
   export function teardownDom() {
     delete globalThis.window; delete globalThis.document;
     delete globalThis.localStorage; delete globalThis.navigator;
   }
   ```
3. `tools/tests/helpers/fake-backend.mjs` — minimal `ProbeBackend` that lets each test inject `getRecovery`, `getCortex`, `getMemoryAccess`, `capabilities`, `activeTarget`. Reduces boilerplate across all 9 panel suites.
4. `tools/tests/helpers/fake-localstorage.mjs` — explicit `get/set/clear` recording, used by `persist-input` + `serial-connection-panel` + `swd-connection-panel` tests.

Skeleton panel test:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { EventBus } from "../../src/core/event-bus.js";
import { Topics } from "../../src/core/event-bus-topics.js";
import { SwdRecoveryPanel } from "../../src/ui/panels/swd-recovery-panel.js";
import { makeFakeBackend } from "./helpers/fake-backend.mjs";

test("SwdRecoveryPanel buttons enable on BACKEND_CONNECTED", () => {
  makeDom(`<div id="root">
    <button id="btn-check-protection"></button>
    <button id="btn-recover"></button>
    <span id="recovery-status"></span>
  </div>`);
  const bus = new EventBus();
  const panel = new SwdRecoveryPanel({
    bus,
    backendProvider: () => makeFakeBackend(),
    logger: { log: () => {} },
  });
  panel.mount(document.getElementById("root"));
  bus.emit(Topics.BACKEND_CONNECTED, {});
  assert.equal(document.getElementById("btn-check-protection").disabled, false);
  teardownDom();
});
```

### 1.6 CI

No `.github/workflows/*.yml` exists. Add `.github/workflows/test.yml`:
```yaml
name: test
on: [push, pull_request]
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd tools && npm ci
      - run: cd tools && npm test
```
Once it lands, every panel test added later guards every panel against regression. Without CI the §1.3 work degrades back to drift inside a month.

### 1.7 Listener-leak guard
Add a one-line helper to `EventBus`:
```js
listenerCount(topic) { return this._topics.get(topic)?.size ?? 0; }
```
Then a single shared test asserts: for every panel, `mount() → unmount()` leaves `bus.listenerCount(topic)` at its pre-mount value for every topic the panel touches. This catches the next time someone forgets `_bindBusListener` in favor of a raw `bus.on()`.

---

## 2. Bugs / architecture findings still open

### 2.1 `backend.transport.device` leak resurrected
- `src/ui/panels/swd-connection-panel.js:52` — `if (backend?.transport?.device === e.device && this._connected)`.
- After A3 added `backend.withQuietLog`, this is the only remaining UI consumer of `backend.transport`. The USB-disconnect comparison needs the device handle.
- Fix: expose `backend.matchesUsbDevice(device)` (or a `backend.usbDevice` getter) on `ProbeBackend`; CmsisDap returns `this.transport.device`; Mock returns `null`; JLink returns `this.transport.device`. Connection panel never touches `.transport` again.
- Test: covered by `tools/tests/swd-connection-panel.test.mjs` USB-disconnect case in §1.3.

### 2.2 Connection panel still does 5 jobs (A8 carry-over)
- `swd-connection-panel.js` is still 188 lines after the rest of the refactor shrank everything else. It owns: connect/disconnect flow, backend chooser, clock chooser, target-selector populate, USB-disconnect handler, compat banner.
- Lower priority than tests but worth flagging: once `BackendSwitcher` + `TargetSelector` sub-components exist, the connection panel's tests in §1.3 split too, and each smaller file is cheaper to keep correct.

### 2.3 JLink backend is still a stub but reachable from the UI (A7 carry-over)
- `src/backends/backend-registry.js:8` exposes `"jlink-webusb"`; `index.html` `<select id="backend-select">` only has `cmsis-dap` (verified). Pick one: hide the registry entry too, or wire the UI option behind `?dev=1`. Either way, the §1.1 JLink tests should assert the stub returns the documented shapes — they're the contract that prevents silent rot.

### 2.4 RttClient runs a separate event system (I3 carry-over)
- `src/rtt/rtt-client.js:38-50` ships its own `on`/`off`/`removeAllListeners`. Two emitters for the same thing.
- Either bridge it onto `EventBus` (`rtt:data`, `rtt:error`, `rtt:channel-found` topics) or accept the divergence and document it. Decision needed before adding more RTT consumers.

### 2.5 Mock backend can't simulate failure (I11 carry-over)
- `src/backends/mock-backend.js` always succeeds → blocks negative-path tests in §1.3 (verify mismatch, program failure, recovery-locked).
- Fix: constructor option `{ failures: { programImage?: Error, verifyImage?: Error, ... } }`; tests inject what they need. Cheap, unlocks the unhappy-path coverage in every panel.

### 2.6 `createPanelLogger`'s `eventBus` arg is still dead (I6 carry-over)
- `src/ui/components/panel-logger.js:3` accepts `{ source, eventBus }` but only uses `source` (and that, only via destructure). Either implement `Topics.LOG_LINE` bridging (so all panel loggers funnel through the bus and live in one truncatable place — pairs with I1) or drop the param. Currently it's a TODO masquerading as a feature.

### 2.7 Unbounded log buffers (I1 carry-over)
- `src/ui/logger.js:5,17-20` pushes `verboseLogLines` forever; `panel-logger.js:5-11` pushes `lines` forever. Long RTT or serial sessions leak memory.
- Fix: cap to `MAX_LINES = 5000` and drop oldest. Add a test asserting line count plateaus.

---

## 3. Lower-priority improvements

### 3.1 `Topics` discipline (I5)
`event-bus-topics.js` freezes the object but neither `EventBus` nor consumers validates the topic. A typo at the call site is silent. Optional: pass `knownTopics: Object.values(Topics)` to the bus constructor and have `emit/on` warn on unknown. Add a test that an unknown topic logs through `console.warn`.

### 3.2 Idempotent `mount`/`unmount` (I2)
None of the 9 panels defend against double-mount or mount-after-unmount. With `BasePanel` in place this is one line: have `_teardown()` short-circuit when `_els === null`. Add a test (one suite, reused by all 9 panels) that calls `mount → unmount → unmount` and `mount → mount` without crashing.

### 3.3 Visualizer prop validation (I4)
`flash-visualizer.js` defaults `flashSize = 1024 * 1024`. Defaults swallow a broken target descriptor. Promote the prop to required and throw on `0`. Test cases land alongside §1.1 visualizer tests.

### 3.4 Hex parser streaming (I13)
`parseIntelHexFileText` takes a full string. Files >10 MB block the UI thread. Not urgent; revisit if a real input triggers it.

### 3.5 `LOCAL_DEV.md` is unchecked since refactor
Verify it still matches the current `serve-https.py` workflow and references the `npm test` / `npm run hitl` split. Adjust if commands moved.

---

## 4. Recommended order

1. **DOM helper + first panel test** — `linkedom`, `helpers/dom.mjs`, `helpers/fake-backend.mjs`, then `swd-recovery-panel.test.mjs` as the proof-of-concept (smallest panel, mirrors §4 of the original plan).
2. **Pure-helper batch** — `intel-hex-encoder`, `escape-html`, `persist-input`, `topbar-build-badge`, `ansi-renderer`, `backend-registry`. No DOM required for the first four; one commit per file (small enough to bundle if helpful).
3. **Visualizer test** — kills the §1.1 regression vector permanently.
4. **Remaining 8 panel tests** — in the order panels were originally migrated.
5. **Core glue** — `serial-manager`, `web-serial-uart`, `transport-webusb.withQuiet`.
6. **JLink stub assertions** — one file covering all four classes (small surface).
7. **Unskip `cmsis-dap-core`** — both SKIPed cases.
8. **CI workflow** (§1.6) — once unit tests are green; this freezes the gains.
9. **Listener-leak guard** (§1.7), then **carry-overs** in §2 in the order they affect future tests: 2.5 (mock failure injection unlocks negative-path tests), 2.1 (transport leak), 2.6 (panel-logger param), 2.7 (log cap), 2.4 (RTT emitter), 2.3 (JLink decision), 2.2 (connection panel split).
10. **Low-priority** in §3 in any order.

Constraints:
- One commit per panel test file. No batching.
- Every test added must run under `npm test` (no hidden HitL gating).
- `npm test` green before each commit.
- Tests describe behavior, not implementation. Don't assert on private fields except where the panel deliberately exposes them via getters (e.g. `imageContext`, `hexFiles`, `upChannelCount`).
