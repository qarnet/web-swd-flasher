# Testing Strategy

## Decision

Use **Puppeteer + real Chrome** as the primary browser integration test framework.

Why:

1. This project depends on native browser permission flows and a USB device picker.
2. We need end-to-end coverage of real DOM + real browser APIs + real hardware.
3. The same model already works in `~/repos/web-bluetooth-dfu` for similar permission-gated hardware workflows.

Non-goal:

- Chrome MCP is not the primary test mechanism for this project because it cannot drive the native chooser interaction needed for automated permission flow coverage.

## Framework choice

### Primary

- Puppeteer (dev-only dependency under `tools/`)

### Optional later

- Node `node:test` wrappers around Puppeteer scripts for richer reporting
- Unit test runner for pure modules (HEX parser, range policy, error mapping)

## Execution model

### Local developer run

- Run local static server (`localhost` or HTTPS local cert setup)
- Launch Puppeteer-controlled Chrome in headed mode
- Drive file upload and connect button actions
- Capture and select device from native chooser event
- Validate UI states and log messages

### Headless-host run (CI/WSL/no display)

- Use `xvfb-run` to provide a virtual display
- Keep Chrome itself in graphical mode
- Do not use true headless mode for hardware chooser paths

## Reference pattern from `web-bluetooth-dfu`

Observed patterns to mirror:

- `tools/` local `package.json` for dev-only browser test deps
- Launch flags for permissions backend features
- `page.waitForDevicePrompt(...)` + explicit chooser selection
- Failure screenshot capture for triage
- Separate commands for desktop and `xvfb-run` operation

## Proposed test layers

1. **Unit tests (pure JS, no hardware)**
   - Intel HEX parsing
   - Address range policy and overlap checks
   - Error normalization mappings
2. **Backend contract tests (mock transport)**
   - Backend interface behavior
   - Progress event schema
   - State transitions on success/failure
3. **Browser integration tests (Puppeteer + hardware)**
   - Permission and device chooser flow
   - Connect/disconnect UI path
   - Flash happy path and verify/reset sequence
4. **Manual destructive/safety checks**
   - Explicit confirmation flows
   - Out-of-policy HEX rejection
   - Recovery messaging for mid-flash disconnect

## Minimum browser test cases for MVP

1. App load and capability check banner behavior
2. Connect flow opens chooser and selects expected probe
3. Probe/target identification shown before flash is enabled
4. HEX upload parse success and address map render
5. Flash + verify + reset happy path
6. Permission denied path with clear remediation
7. Interface claim failure path with clear remediation
8. Device disconnect during operation path with actionable recovery

## Environment requirements

- Chromium-based browser compatible with WebUSB
- Working USB access to probe from host OS
- Local secure context (`https://` or suitable `localhost` policy)
- Linux: display available or `xvfb-run` installed

## Repository policy alignment

- Keep runtime app dependency-free (no framework, no runtime npm deps).
- Place test-only dependencies under `tools/` and keep them out of production artifacts.

## Early implementation checklist

1. Add `tools/package.json` with Puppeteer. Done.
2. Add `tools/browser-smoke.mjs` for launch + chooser smoke test. Done.
3. Add `docs/testing.md` command section once scripts exist. Done.
4. Add screenshot-on-failure and structured exit codes.
5. Wire one `make` target for local and one for `xvfb-run`. Done.

## Current commands

Preferred workflow: run commands through Nix shell.

```bash
nix develop
```

Or run a one-off command:

```bash
nix develop -c make browser-smoke
```

Inside the Nix shell, `PUPPETEER_CHROME` is set to Nix-provided Chromium and
`PUPPETEER_SKIP_DOWNLOAD=1` avoids Puppeteer downloading its own browser.

Install test dependencies:

```bash
make tools-install
```

Start app server (separate terminal):

```bash
make serve
```

Run chooser smoke test (desktop):

```bash
make browser-smoke
```

Run chooser smoke test (virtual display):

```bash
make browser-smoke-xvfb
```

Optional environment variables:

- `APP_URL` (default `http://localhost:8000`)
- `PUPPETEER_CHROME` (custom Chrome path)
- `BACKEND` (`mock`, `jlink-webusb`, `cmsis-dap`; default `mock`)
- `HEADLESS=1` intentionally fails fast for chooser tests
