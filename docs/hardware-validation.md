# Hardware Validation Workflow

This project depends on real USB probe behavior. Use this checklist for milestone
validation on a connected nRF52840 DK.

## Windows driver setup (Zadig)

On Windows, the OS claims USB interfaces with class drivers (CDC, HID) that block
Chrome's `claimInterface()`. Use [Zadig](https://zadig.akeo.ie/) to replace the
driver on the CMSIS-DAP bulk interface with WinUSB:

1. Connect the Pico Debugprobe via USB.
2. Download and run Zadig from https://zadig.akeo.ie/.
3. Click **Options → List All Devices**.
4. Select **"Picoprobe CMSIS-DAP v2 (Interface 0)"** from the dropdown.
5. Set the driver to **WinUSB**.
6. Click **Replace Driver** and wait for completion.

After this, Chrome WebUSB can claim Interface 0 (the bulk CMSIS-DAP endpoint)
on the Pico Debugprobe. The CDC serial interface remains untouched.

> **Warning**: Do NOT replace drivers on all interfaces — only Interface 0.
> Replacing the CDC driver will break the serial console function.

## Preconditions

1. DK attached to WSL2 via `usbipd`.
2. `lsusb` shows `1366:1051` (SEGGER J-Link).
3. Browser launched through Nix shell (`nix develop`).

## Step 1: Bring up app and smoke harness

```bash
make serve
make browser-smoke BACKEND=mock
```

Expected: harness passes with mock backend.

## Step 2: J-Link WebUSB connect validation

```bash
BACKEND=jlink-webusb make browser-smoke-xvfb
```

If Puppeteer does not capture prompt, select the device manually in chooser and
observe app status/log updates.

Expected:

- Connect succeeds
- Probe info appears
- Disconnect succeeds

## Step 3: CMSIS-DAP read-only validation

Use backend selector in app (`cmsis-dap`) and connect.

Expected:

- DAP connect sequence completes
- DPIDR is readable
- FICR read attempt is logged

## Step 4: Program/verify/reset validation

1. Load a known-good app HEX in allowed app range.
2. Tick flash confirmation checkbox.
3. Program, then verify, then reset.

Expected:

- NVMC erase/program events in log
- Verify reaches 100%
- Target resets and runs

## Failure capture

- Keep `browser-smoke-failure.png`.
- Save event log lines from app.
- Record VID/PID and backend selected.
