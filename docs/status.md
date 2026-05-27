# Progress Status

## Completed

- M0: Static app shell with compatibility checks and connection controls.
- M0.5: Puppeteer chooser smoke harness with desktop and `xvfb-run` paths.
- M1: Intel HEX parser, image map formatter, and nRF52 app-range policy checks.
- M2: Backend abstraction baseline (`backend-interface`, manager, and mock backend) with UI integration.
- M5 (partial): Target info panel logging path now includes structured FICR formatting when backend data is available.

## In progress

- M3: J-Link WebUSB connectivity spike.
- M4: J-Link flash protocol implementation.
- M6: CMSIS-DAP read path implementation.

## Notes

- M1 and M2 include `node:test` coverage under `tools/tests/`.
- Runtime app remains framework-free and dependency-free; test deps are confined to `tools/`.
