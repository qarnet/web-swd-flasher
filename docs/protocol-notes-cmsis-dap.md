# Protocol Notes: CMSIS-DAP

Purpose: capture implementation notes for the `cmsis-dap` backend using WebUSB/WebHID-style transports where available.

## Scope

- Initial target: nRF52840
- Initial goals:
  - `DAP_Info`
  - SWD connect
  - DPIDR/AP reads
  - FICR reads
  - nRF52 flash sequence (post read-only spike)

## Test environment

- Date:
- Host OS:
- Browser/version:
- Probe model:
- Probe firmware:
- Transport mode (HID/Bulk/WebUSB):

## Transport notes

- VID/PID:
- Interface number:
- Endpoint numbers:
- Packet size:
- Report framing details:

## Command coverage tracking

Mark as implemented/validated during development.

- DAP_Info
- DAP_Connect / DAP_Disconnect
- DAP_TransferConfigure
- DAP_SWJ_Clock
- DAP_SWJ_Sequence
- DAP_Transfer
- DAP_TransferBlock
- Reset-related commands used

## ADI/SWD notes

- DPIDR values observed:
- AP selection behavior:
- WAIT/FAULT handling strategy:
- Retry policy:

## nRF52 flash notes

- Memory map constants used:
- Page erase sequence:
- Program word/block strategy:
- Verify approach:
- Reset/run sequence:

## Error signatures

- No compatible interface found:
- Claim/open failure:
- Transfer timeout:
- WAIT saturation:
- FAULT on protected region:

## Open questions

- Which probes are consistently usable from browser on Windows?
- Is WebHID fallback needed for practical probe coverage?
- What minimum command subset gives robust nRF52 flashing?

## References

- pyOCD (Apache-2.0) for behavior reference
- DAPjs (MIT) for JS layering reference
- CMSIS-DAP public spec/docs
