# Firmware Artifact Policy

Canonical tracked artifact:

- `xiao_ble_nrf52840_sense.hex`

Rules:

- `build/` stays ignored
- `make build` refreshes the tracked hex from `build/firmware/zephyr/zephyr.hex`
- commit the hex only when firmware behavior intentionally changes
- do not commit rebuild-only noise

Board target:

- `xiao_ble/nrf52840/sense`
