# Protocol Notes: J-Link WebUSB

Purpose: capture observed behavior and assumptions for the `jlink-webusb` backend.

## Scope

- Target hardware: nRF52840 DK with J-Link OB
- Browser: Chromium-based
- Goal: enough protocol understanding for reliable connect/flash/verify/reset MVP

## Test environment

- Date:
- Host OS:
- Browser/version:
- Board revision:
- J-Link OB firmware version:

## USB enumeration notes

- Vendor ID / Product ID:
- Product/manufacturer strings:
- Configurations/interfaces discovered:
- Endpoints (bulk/control) used:

## Session flow observations

Document exact sequence seen in successful operations:

1. Device request and selection filter
2. Open/select configuration/claim interface
3. Initial handshake
4. Transfer framing
5. Progress/result signaling
6. Disconnect/release behavior

## Flash behavior notes

- Accepted image formats confirmed in practice:
- Any required metadata/headers:
- Maximum tested image size:
- Verify behavior:
- Reset behavior:

## Error signatures

- Permission denied:
- Interface claim failure:
- Transfer timeout:
- Device disconnected mid-operation:
- Other recurring failures:

## Open questions

- Can target identification/FICR reads be performed over this backend directly?
- Is behavior stable across J-Link OB firmware versions?
- Are there license constraints on protocol specifics beyond public docs?

## References

- SEGGER KB J-Link WebUSB
- SEGGER WebUSB demo page
