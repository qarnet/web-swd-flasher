BOARD ?= xiao_ble/nrf52840/sense
BUILD_DIR ?= build
RUNNER ?= pyocd
PUBLISHED_HEX ?= xiao_ble_nrf52840_sense.hex

.PHONY: build clean flash

build:
	nrfutil sdk-manager toolchain launch --ncs-version v3.3.0 -- \
		bash -c 'export ZEPHYR_BASE=$$HOME/ncs/v3.3.0/zephyr && \
		west build -b $(BOARD) -d $(BUILD_DIR) .'
	cp "$(BUILD_DIR)/firmware/zephyr/zephyr.hex" "$(PUBLISHED_HEX)"

clean:
	rm -rf $(BUILD_DIR)

flash:
	nrfutil sdk-manager toolchain launch --ncs-version v3.3.0 -- \
		bash -c 'export ZEPHYR_BASE=$$HOME/ncs/v3.3.0/zephyr && \
		west flash -d $(BUILD_DIR) -r $(RUNNER)'
