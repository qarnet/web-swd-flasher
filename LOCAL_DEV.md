# Local HTTPS Setup

The web flasher requires a **secure context** (HTTPS or localhost) for WebHID/USB access.

## Quick Start

```bash
# 1. Start the server
make serve-https
# → https://localhost:8443
# → https://192.168.178.65:8443
```

## Trusting the self-signed certificate

When you first open `https://192.168.178.65:8443/`, Chrome will show a security warning. To make it trusted:

### Option A: Import the CA certificate (one-time)

1. Copy `rootCA.pem` to your browser machine
2. **Windows**: Double-click → Install Certificate → Local Machine → Place all certificates in "Trusted Root Certification Authorities"
3. **macOS**: Double-click → Add to Keychain → Open Keychain Access → Set to "Always Trust"
4. **Linux**: `sudo cp rootCA.pem /usr/local/share/ca-certificates/ && sudo update-ca-certificates`
5. Restart Chrome

### Option B: Chrome flag (for development only)

Open `chrome://flags/#unsafely-treat-insecure-origin-as-secure` and add `http://192.168.178.65:8000` (or your IP). This removes the need for HTTPS entirely for that origin.

### Option C: localhost only (probe on same machine)

If the USB probe is connected to the same machine running WSL2, just use `http://localhost:8000`. Browsers treat `localhost` as a secure context.

## Firmware variants

The `firmware/` directory contains pre-built blinky binaries for the Seeed XIAO BLE (nRF52840):

| File | Offset | Use case |
|------|--------|----------|
| `blinky-xiao_ble-bare.hex` | `0x0000` | Bare metal, no bootloader |
| `blinky-xiao_mbr.hex` | `0x1000` | Nordic MBR only |
| `blinky-xiao_sdv6.hex` | `0x26000` | Adafruit UF2 + SoftDevice s140 v6 |
| `blinky-xiao_sdv7.hex` | `0x27000` | Adafruit UF2 + SoftDevice s140 v7 |

These are only served locally (not deployed to GitHub Pages). The firmware dropdown auto-hides when the files aren't available.