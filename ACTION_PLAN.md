# Action Plan — Testing Phase 2 — COMPLETED

Status: 597 tests pass, 0 fail. Phase 2 closed the cleanup, gap-filling, and new-backend-coverage work. The `app.js` bootstrap test (Step 3b) was attempted but blocked by linkedom's read-only `<select>.value` setter — needs a refactor or Puppeteer integration.

---

## Step 1 — Clean up ✅

- 1a. Deleted `tools/tests/terminal-session-sendraw.test.mjs` (3 duplicate tests).
- 1b. Extracted `setupStore`, `makeDomAndStore`, `getStoreValue`, `seedStore`, `attachControls` to `tools/tests/helpers/dom.mjs`. Removed duplicated code from 4 test files.
- 1c. `attachControls` extracted and used in 2 test files.

## Step 2 — Fix existing test gaps ✅

- 2a. Added 5 `diagRawRead32` tests to `cmsis-dap-backend.test.mjs`.
- 2b. Added 5 `connect` orchestration tests (call order, detect target, flash programmer, error propagation).
- 2c. Added 5 `dap-uart` error path tests (setTransport/configure/control error responses, close lifecycle, error swallowing).
- 2d. Added 3 xterm uncovered branch tests (Escape key, copy safety, sidebar reparenting).

## Step 3 — New test files

- 3a. `tools/tests/web-serial-uart.test.mjs` — 18 tests ✅
- 3b. `tools/tests/app.test.mjs` — **BLOCKED**: `init()` calls `backendSelect.value = ...` on line 77, which throws on linkedom's read-only `<select>.value` setter. The async rejection pollutes the test runner. Either refactor `app.js` to split `init()` into testable units, or use Puppeteer for true browser testing. The pre-existing `app-bootstrap.test.mjs` still covers import resolution.
- 3c. `tools/tests/transport-webusb.test.mjs` — 20 tests ✅
- 3d. `tools/tests/jlink-webusb.test.mjs` — 18 tests ✅

## Step 4 — Infrastructure ✅

- 4a. Helpers extracted to `tools/tests/helpers/dom.mjs`.
- 4b. `teardownDom` now clears `ResizeObserver` and `_testStore`.
- 4c. `.gitignore` — no changes needed (no temp files left behind).

---

## Final tally

- Tests: 524 → 597 (+73)
- Test files: 60 → 63 (+3 new, -1 deleted)
- Total LOC in test changes: ~1700

## Known remaining gaps (not in this phase)

- `src/app.js` `init()` — 190 lines, untested. Refactor recommended before adding tests.
- `src/build-info.js` — trivial single-line export, skipped.

---

## Step 1 — Clean up (15 min)

### 1a. Delete `tools/tests/terminal-session-sendraw.test.mjs`

- **Why:** All 3 tests (`sendRaw`, `sendLine`, `send`) exist verbatim in `tools/tests/serial-session.test.mjs` (lines 16-41). They test the same class with the same mock and the same assertions. Running both files adds 3 duplicate tests to the suite with zero marginal coverage.
- **How:** `rm tools/tests/terminal-session-sendraw.test.mjs`
- **Verify:** `npm test` still passes.

### 1b. Extract `setupStore` / `makeDomAndStore` to `tools/tests/helpers/dom.mjs`

- **Why:** 4 test files (terminal-sidebar-controller, rtt-session, dap-uart-session, xterm-terminal-panel) contain identical copies of the localStorage-seeded DOM setup. ~16 lines duplicated 4 times.
- **How:** Add `setupStore()` and `makeDomAndStore()` exports to `helpers/dom.mjs`. Update all 4 files to import them. The `_store` variable must remain file-local for tests that need to read from it directly — export a `getStoreValue(key)` helper too.
- **Verify:** `npm test` still passes. Grep for `function setupStore` in `tools/tests/` returns only `helpers/dom.mjs`.

### 1c. Extract `attachControls(session)` to helpers

- **Why:** Identical 4-line function duplicated in `rtt-session.test.mjs` and `dap-uart-session.test.mjs`. Appends `session.buildControls()` result to `#root`.
- **How:** Add to `helpers/dom.mjs`. Both files import it.
- **Verify:** `npm test` passes.

---

## Step 2 — Fix existing test gaps (low effort)

### 2a. `src/backends/cmsis-dap/backend.js` — test `diagRawRead32()`

- **File:** `tools/tests/cmsis-dap-backend.test.mjs`
- **Add ~3 tests:**
  1. `diagRawRead32 returns 7-step diagnostic object` — verify each key exists (`step1_selectAp` through `step7_readAnotherAddr`) and values are strings.
  2. `diagRawRead32 selects AP 0 and reads DP SELECT` — verify `selectAp(0,0)` called and DP SELECT read.
  3. `diagRawRead32 writes CSW=0x23000052 then reads DRW` — verify transferMultiple called with correct AP register addresses.
- **Mock needed:** FakeAdi's `selectAp` and Fake core's `transfer`/`transferMultiple`.

### 2b. `src/backends/cmsis-dap/backend.js` — test connect orchestration

- **File:** `tools/tests/cmsis-dap-backend.test.mjs`
- **Add ~5 tests:**
  1. `connect calls core.connect then adi.connectSwd` — verify call order.
  2. `connect calls detectTarget with adi` — verify `_detectedTarget` and `_ficr` populated.
  3. `connect calls createFlashProgrammer with activeTarget and {adi, bus}` — verify `_flash` set.
  4. `connect propagates errors from core.connect` — verify error bubbles.
  5. `connect propagates errors from adi.connectSwd` — verify error bubbles.

### 2c. `src/backends/cmsis-dap/dap-uart.js` — test error paths

- **File:** `tools/tests/dap-uart.test.mjs`
- **Add ~5 tests:**
  1. `setTransport throws on non-zero response byte` — queue response `[0x1f, 0x01]`, verify rejection.
  2. `configure throws on non-zero response byte` — queue response `[0x20, 0x01]`, verify rejection.
  3. `control throws on non-zero response byte` — queue response `[0x22, 0x01]`, verify rejection.
  4. `close stops polling and sends control(false, false)` — start poll, call close, verify `_polling = false`, verify `clearTimeout` called.
  5. `close catches errors from control/setTransport` — make `control` throw, verify close completes without throwing.

### 2d. `src/ui/panels/xterm-terminal-panel.js` — test small uncovered branches

- **File:** `tools/tests/xterm-terminal-panel.test.mjs`
- **Add ~3 tests:**
  1. `Escape key in search input closes all dropdowns` — open search dropdown, dispatch Escape keydown on search input, verify dropdown display is "none".
  2. `copy button fails gracefully when clipboard rejects` — mock `navigator.clipboard.writeText` to throw, verify button text doesn't break.
  3. `sidebar DOM elements are reparented into correct grid slots` — verify templates aside moves to `.terminal-templates-slot`, queue aside moves to `.terminal-queue-slot`.

---

## Step 3 — New test files (high effort)

### 3a. `tools/tests/web-serial-uart.test.mjs` — CRITICAL

- **Source:** `src/backends/serial/web-serial-uart.js` (108 lines)
- **What to test (~12 tests):**
  1. Constructor initializes all internal state to null/false
  2. `static get supported()` returns boolean
  3. `requestPort(filters)` calls `navigator.serial.requestPort` with filters object
  4. `requestPort(filters)` stores port and returns `getInfo()` result
  5. `requestPort()` without filters calls `navigator.serial.requestPort({})`
  6. `getAuthorizedPorts()` returns mapped `getInfo()` results
  7. `useAuthorizedPort()` returns first port info, null when no ports
  8. `useAuthorizedPort()` stores port from `getPorts()[0]`
  9. `open()` throws when no port selected
  10. `open()` with port calls `port.open({baudRate, dataBits, stopBits, parity, flowControl})`
  11. `open()` starts reader loop (calls `port.readable.getReader()`)
  12. `open()` reader loop calls `this._onData(value)` for each chunk
  13. `open()` reader loop catches errors and sets `_reading = false`
  14. `close()` cancels reader, releases lock, closes port
  15. `close()` handles errors from reader.cancel / lock release / port.close gracefully
  16. `send(data)` writes to port via `getWriter().write(data)`
  17. `send(data)` throws "Serial port not open" when no writable
  18. `connected` getter returns `_connected`
  19. `info` getter returns `port.getInfo()` when port exists, null otherwise
- **Mock needed:** Fake `ReadableStream` / `WritableStream` with controllable reader/writer. Node's built-in `ReadableStream`/`WritableStream` from `node:stream/web` should work.

### 3b. `tools/tests/app.test.mjs` — CRITICAL

- **Source:** `src/app.js` (252 lines)
- **Architecture note:** `app.js` has module-level side effects (registers global `onload` handler). Tests must import it after DOM setup. The `app.js` default export is the module itself; `init()` is a named export but also called by the `window.addEventListener("load", ...)` at module bottom. Tests need to prevent auto-init.

- **What to test (~20 tests):**
  **refreshVisualizer (lines 33-60):**
  1. dom elements without flash-regions — no crash
  2. dom elements with flash-regions present — calls `FlashVisualizer.refresh`

  **setFlashProgress (lines 173-185):**
  3. progress bar shown when percent > 0
  4. progress bar hidden when percent === null
  5. progress bar fill width set to `${percent}%`
  6. progress bar fill width clamps to 0%/100% boundaries

  **init() — panel mounting (lines 62-167):**
  7. All 12 panels mounted to correct DOM elements (verify `.panel-mount-point` queries work)
  8. SWD connection panel: bus disconnect listener registered
  9. Serial connection panel: serial disconnect listener registered

  **init() — bus subscriptions (lines 98-101, 163-191):**
  10. `FLASH_PROGRESS` event calls `setFlashProgress`
  11. `IMAGE_CHANGED` event calls `refreshVisualizer`
  12. `READ_REGIONS_CHANGED` event calls `refreshVisualizer`
  13. `BACKEND_CONNECTED` / `BACKEND_DISCONNECTED` toggle verbosity + visualizer
  14. `LOG_LINE` event calls `logger.log`

  **Theme toggle (lines 89-94):**
  15. Button click toggles `html[data-theme]` between "light" and "dark"
  16. Button click persists to `localStorage.getItem("theme")`
  17. Init restores theme from localStorage

  **Event log collapse (lines 193-218):**
  18. Click button toggles `logEl.style.maxHeight` between "0px" and "calc(...)"
  19. MutationObserver on `logEl` auto-expands when content changes

  **Service worker (lines 243-248):**
  20. `navigator.serviceWorker` registration called (if available)
  21. Registration failure logged but doesn't crash

- **Mock needed:** All panels must be stubbable (they're probably imported and instantiated). May need to mock module exports or provide fake DOM elements with expected IDs. Biggest test — likely 200+ lines of setup.

### 3c. `tools/tests/transport-webusb.test.mjs` — HIGH

- **Source:** `src/backends/cmsis-dap/transport-webusb.js` (211 lines)
- **What to test (~10 tests):**
  1. Constructor stores logger
  2. `open()` requests device via `navigator.usb.requestDevice`
  3. `open()` selects alternateInterface 0, claims interface
  4. `open()` finds bulk OUT and IN endpoints
  5. `open()` throws when no out endpoint
  6. `open()` throws when claiming fails
  7. `close()` closes device connection
  8. `close()` safe when device is null
  9. `read()` reads from transferIn endpoint
  10. `write()` writes to transferOut endpoint
  11. `withQuiet(fn)` suppresses logger, calls fn, restores logger
  12. `diagnoseClaimFailures()` logs USB device details
  13. `device` getter returns current device
- **Mock needed:** Fake `navigator.usb` with `requestDevice`, fake `USBDevice` with interfaces/endpoints.

### 3d. `tools/tests/jlink-webusb.test.mjs` — HIGH

- **Source:** `src/backends/jlink-webusb/` (4 files, 292 lines)
- **What to test (~8 tests):**
  1. `JLinkWebUsbBackend.requestDevice` delegates to transport
  2. `JLinkWebUsbBackend.connect` calls `client.connect`
  3. `JLinkWebUsbBackend.disconnect` calls `client.disconnect`
  4. `JLinkWebUsbBackend.getProbeInfo` returns probe metadata
  5. `JLinkWebUsbBackend.capabilities` returns correct flags (readMemory=false)
  6. `JLinkWebUsbBackend.readMemory` throws "not implemented"
  7. `JLinkWebUsbFlasher.programImage` emits FLASH_PROGRESS events
  8. `JLinkWebUsbFlasher.reset` emits mode-specific progress

---

## Step 4 — Infrastructure improvements

### 4a. Add `makeDomAndStore` + `setupStore` to `helpers/dom.mjs`

```js
let _testStore = {};
export function setupStore() {
  _testStore = {};
  globalThis.localStorage = {
    getItem(k) { return _testStore[k] ?? null; },
    setItem(k, v) { _testStore[k] = v; },
    removeItem(k) { delete _testStore[k]; },
  };
}
export function makeDomAndStore(html) {
  makeDom(html);
  globalThis.localStorage = {
    getItem(k) { return _testStore[k] ?? null; },
    setItem(k, v) { _testStore[k] = v; },
    removeItem(k) { delete _testStore[k]; },
  };
}
export function getStoreValue(key) { return _testStore[key]; }
export function seedStore(key, value) { _testStore[key] = value; }
export function attachControls(session) {
  const container = session.buildControls();
  document.getElementById("root").appendChild(container);
}
```

### 4b. Add `cleanupResizeObserver` to test teardown

The `ResizeObserver` mock added in Phase 1 never gets cleaned up. Add to `helpers/dom.mjs`:

```js
export function teardownDom() {
  delete globalThis.ResizeObserver;
  // ... existing ...
}
```

### 4c. Add `.gitignore` entries for test artifacts

Add: `tools/tests/mocks/` (if recreated), `tools/_test_*.mjs`

---

## Execution order by impact

| Order | Task | New tests | Effort |
|---|---|---|---|
| 1 | Step 1a — delete `terminal-session-sendraw.test.mjs` | 0 | 1 min |
| 2 | Step 1b + 1c — extract helpers, update 4 files | 0 | 15 min |
| 3 | Step 2a — `diagRawRead32` tests | 3 | 20 min |
| 4 | Step 2b — `connect` orchestration tests | 5 | 30 min |
| 5 | Step 2c — `dap-uart` error paths | 5 | 20 min |
| 6 | Step 2d — `xterm` uncovered branches | 3 | 20 min |
| 7 | Step 3a — `web-serial-uart.test.mjs` | 19 | 45 min |
| 8 | Step 3c — `transport-webusb.test.mjs` | 13 | 30 min |
| 9 | Step 3d — `jlink-webusb.test.mjs` | 8 | 25 min |
| 10 | Step 3b — `app.test.mjs` | 21 | 90 min |
| 11 | Step 4a — `helpers/dom.mjs` additions | 0 | 10 min |
| 12 | Step 4b + 4c — cleanup | 0 | 5 min |

**Total: ~77 new tests, ~5 hours.**

---

## Verification gates

After each step: `npm test` must pass (0 failures, expected count increment).

After Step 3b (app.test.mjs): run `npm run browser-smoke` and `npm run browser-tests` (Puppeteer) to verify the app still boots correctly in a real browser with the mock backend.

Final gate: all 4 steps complete, `npm test` shows 601+ tests, 0 failures.
