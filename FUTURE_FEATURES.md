# Future Features

## DAP_UART via WebUSB (probe-native UART)

Some CMSIS-DAP probes implement the DAP_UART command set (v2.1, capability bit 7).
When the SWD connection detects DAP_UART support, the Serial Terminal section could
offer a "Use probe UART" toggle that routes UART data through the existing WebUSB
connection instead of requiring a separate Web Serial port.

Benefits:
- Single USB connection for SWD + UART (no second port selection)
- Lower latency than CDC-ACM through OS serial driver
- Works on probes that don't expose CDC-ACM

Implementation notes:
- DapUartSession (src/backends/cmsis-dap/dap-uart.js) already implements this
- Need to wire it as an alternative transport in serial-manager.js
- UI should show "Probe supports UART — use probe connection?" when available