# Stable Development Platform — Audit

Refactor + first test wave landed in 539e613 (93 files, 208 tests, 0 fail). Goal of this pass: identify what still blocks confident shipping. Skip nit-level test gaps unless they block a deploy.

---

## State today

- `npm test` — 208 pass / 2 skip / 0 fail.
- CI workflow `.github/workflows/test.yml` runs unit tests on push + PR.
- Deploy workflow `.github/workflows/deploy-pages.yml` ships `main` to GitHub Pages.
- Panel test harness exists: `tools/tests/helpers/{dom,fake-backend,fake-adi,fake-core,fake-transport,make-image}.mjs`.
- 7 of 9 panels have tests: swd-connection, swd-debug, swd-memory, swd-recovery, swd-uicr, serial-connection, serial-terminal.
- Helper tests landed: escape-html, intel-hex-encoder, backend-registry, persist-input, flash-visualizer, topbar-build-badge.

---

## What blocks "stable platform" (priority order)

### P0 — Deploy is not gated on tests

`.github/workflows/deploy-pages.yml` triggers on every push to `main` independently of `test.yml`. A broken commit ships. This is the single biggest stability gap; everything else is noise next to this.

Fix:
```yaml
# deploy-pages.yml
on:
  workflow_run:
    workflows: ["test"]
    types: [completed]
    branches: [main]
jobs:
  deploy:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    ...
```
Or merge the two workflows: `deploy` job with `needs: unit`.

### P1 — CI uses `npm install`, not `npm ci`

`test.yml:10` runs `npm install --ignore-scripts`. Lockfile can drift silently; a regression caused by a dep bump won't reproduce locally. Switch to `npm ci --ignore-scripts`. Same on deploy if it ever installs.

### P2 — No bootstrap smoke test for `app.js`

Every unit test mounts panels in isolation. Nothing asserts `init()` itself doesn't throw against `index.html`. A broken import or missing DOM id sails through `npm test` and breaks the deployed app on load.

Cheapest fix: one `tools/tests/app-bootstrap.test.mjs` that:
1. Loads `index.html` via `linkedom`,
2. Imports `src/app.js` and fires `DOMContentLoaded`,
3. Asserts no exception, asserts a known DOM marker (e.g. `#status` text is "Ready").

This catches index/app divergence on every CI run, no Puppeteer needed.

### P3 — Puppeteer browser-tests not in CI

`tools/browser-tests.mjs` already runs golden flows (connect → program → verify) against a faked `navigator.usb`. Not wired to CI → only run by whoever remembers. Add a second job:
```yaml
browser:
  needs: unit
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '22' }
    - run: cd tools && npm ci
    - run: python3 -m http.server 8000 &
    - run: cd tools && APP_URL=http://localhost:8000 node browser-tests.mjs
```
HitL stays manual (correct — needs hardware).

### P4 — Two panels still untested

- `SwdFirmwarePanel` (317 lines) — riskiest path in the app. Loads hex, runs program/verify/reset. No coverage.
- `SwdRttPanel` (166 lines) — timer-driven polling, channel state, send path.

Stable-platform impact: without these, a refactor in `multi-hex-merger`, `image-map`, `nrf52-memory-map`, `rtt-client`, or backend `programImage` semantics ships untested. The flash path is the one a user notices breaking. These two test files matter; the rest of the panel/helper test backlog does not.

### P5 — Two skipped protocol tests

`tools/tests/cmsis-dap-core.test.mjs` — `cmsis-dap connect sends setup commands` and `cmsis-dap transfer retries wait/noack`, both `{ skip: "needs full connect mock sequence" }`. Without these, CMSIS-DAP wire-level regressions reach hardware. Build the `FakeTransport.read()` scripted queue and unskip.

### P6 — Single mega-commit makes bisect hard

539e613 changed 93 files (3623 ins / 1920 del). Future regression cannot be bisected to a narrower cause than "the big refactor." Going forward, enforce one logical change per commit. This is process, not code — a one-line CONTRIBUTING.md note is enough.

---

## Not stability-blocking (do later if at all)

- Remaining helper tests (ansi-renderer, serial-manager, web-serial-uart, transport-webusb withQuiet, jlink-*, tab-controller, base-panel, log-panel-helpers, logger). These are pure correctness coverage; their absence won't surface as a deploy failure.
- `swd-connection-panel.js:52` `backend.transport.device` leak — works correctly, only architecturally ugly.
- JLink stub registered in `backend-registry` but hidden from `index.html`. Dead surface but doesn't break anything.
- RttClient ships its own emitter alongside `EventBus`. Two patterns; both correct.
- Unbounded log buffers in `logger.js` and `panel-logger.js`. Real but slow leak; matters for hour-long RTT sessions, not for typical use.
- Deploy uploads `path: '.'` — pages artifact includes `tools/`, `docs/`, `firmware/`. Bigger than needed; not a stability issue.
- `MockBackend` always succeeds → negative-path panel tests can't exercise real error rendering. Limits test depth, not platform stability.
- Tab/mode state not persisted across reload. UX wart, not a platform problem.

---

## Recommended order

1. **P0** — gate deploy on test pass. One yaml edit. Biggest payoff.
2. **P1** — `npm ci` swap. One yaml edit.
3. **P2** — bootstrap smoke test. ~30 lines, prevents the worst class of deploy regression.
4. **P3** — Puppeteer in CI. One workflow job.
5. **P4** — `SwdFirmwarePanel` + `SwdRttPanel` tests. Two commits.
6. **P5** — unskip the two cmsis-dap-core tests.
7. **P6** — CONTRIBUTING.md note on one-logical-change-per-commit.

After P0–P3 land, the platform is shippable with confidence. P4–P6 widen the safety net.
