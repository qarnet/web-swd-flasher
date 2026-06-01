# udev Rules for Debug Probes (NixOS)

Reference udev rules for web-based SWD flasher probes.

## NixOS Configuration

Add this to your `configuration.nix` or equivalent:

```nix
udev.extraRules = ''
# === CMSIS-DAP / DAPLink ===
KERNEL=="hidraw*", ATTRS{idVendor}=="0d28", ATTRS{idProduct}=="0204", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="0d28", ATTR{idProduct}=="0204", MODE="0664", GROUP="plugdev"

# === Raspberry Pi Picoprobe ===
KERNEL=="hidraw*", ATTRS{idVendor}=="2e8a", ATTRS{idProduct}=="0004", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="2e8a", ATTR{idProduct}=="0004", MODE="0664", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="2e8a", ATTRS{idProduct}=="000c", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="2e8a", ATTR{idProduct}=="000c", MODE="0664", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="2e8a", ATTRS{idProduct}=="f00a", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="2e8a", ATTR{idProduct}=="f00a", MODE="0664", GROUP="plugdev"

# === Keil ULINKplus ===
KERNEL=="hidraw*", ATTRS{idVendor}=="c251", ATTRS{idProduct}=="2750", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="c251", ATTR{idProduct}=="2750", MODE="0664", GROUP="plugdev"

# === NXP LPC-LinkII ===
KERNEL=="hidraw*", ATTRS{idVendor}=="1fc9", ATTRS{idProduct}=="0090", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="1fc9", ATTR{idProduct}=="0090", MODE="0664", GROUP="plugdev"

# === NXP MCU-Link ===
KERNEL=="hidraw*", ATTRS{idVendor}=="1fc9", ATTRS{idProduct}=="0143", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="1fc9", ATTR{idProduct}=="0143", MODE="0664", GROUP="plugdev"

# === Microchip EDBG CMSIS-DAP ===
KERNEL=="hidraw*", ATTRS{idVendor}=="03eb", ATTRS{idProduct}=="2111", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="03eb", ATTR{idProduct}=="2111", MODE="0664", GROUP="plugdev"

# === Microchip JTAGICE3 CMSIS-DAP ===
KERNEL=="hidraw*", ATTRS{idVendor}=="03eb", ATTRS{idProduct}=="2140", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="03eb", ATTR{idProduct}=="2140", MODE="0664", GROUP="plugdev"

# === Microchip Atmel-ICE CMSIS-DAP ===
KERNEL=="hidraw*", ATTRS{idVendor}=="03eb", ATTRS{idProduct}=="2141", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="03eb", ATTR{idProduct}=="2141", MODE="0664", GROUP="plugdev"

# === Microchip Power Debugger CMSIS-DAP ===
KERNEL=="hidraw*", ATTRS{idVendor}=="03eb", ATTRS{idProduct}=="2144", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="03eb", ATTR{idProduct}=="2144", MODE="0664", GROUP="plugdev"

# === Microchip mEDBG CMSIS-DAP ===
KERNEL=="hidraw*", ATTRS{idVendor}=="03eb", ATTRS{idProduct}=="2145", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="03eb", ATTR{idProduct}=="2145", MODE="0664", GROUP="plugdev"

# === Microchip EDBGC CMSIS-DAP ===
KERNEL=="hidraw*", ATTRS{idVendor}=="03eb", ATTRS{idProduct}=="216c", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="03eb", ATTR{idProduct}=="216c", MODE="0664", GROUP="plugdev"

# === Microchip nEDBG CMSIS-DAP ===
KERNEL=="hidraw*", ATTRS{idVendor}=="03eb", ATTRS{idProduct}=="2175", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="03eb", ATTR{idProduct}=="2175", MODE="0664", GROUP="plugdev"

# === Cypress KitProg1/KitProg2 CMSIS-DAP ===
KERNEL=="hidraw*", ATTRS{idVendor}=="04b4", ATTRS{idProduct}=="f138", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="04b4", ATTR{idProduct}=="f138", MODE="0664", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="04b4", ATTRS{idProduct}=="f148", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="04b4", ATTR{idProduct}=="f148", MODE="0664", GROUP="plugdev"

# === Cypress MiniProg4 CMSIS-DAP ===
KERNEL=="hidraw*", ATTRS{idVendor}=="04b4", ATTRS{idProduct}=="f151", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="04b4", ATTR{idProduct}=="f151", MODE="0664", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="04b4", ATTRS{idProduct}=="f152", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="04b4", ATTR{idProduct}=="f152", MODE="0664", GROUP="plugdev"

# === Cypress KitProg3 CMSIS-DAP ===
KERNEL=="hidraw*", ATTRS{idVendor}=="04b4", ATTRS{idProduct}=="f154", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="04b4", ATTR{idProduct}=="f154", MODE="0664", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="04b4", ATTRS{idProduct}=="f155", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="04b4", ATTR{idProduct}=="f155", MODE="0664", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="04b4", ATTRS{idProduct}=="f166", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="04b4", ATTR{idProduct}=="f166", MODE="0664", GROUP="plugdev"

# === ST-Link V2 ===
KERNEL=="hidraw*", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="3748", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="0483", ATTR{idProduct}=="3748", MODE="0664", GROUP="plugdev"

# === ST-Link V2-1 ===
KERNEL=="hidraw*", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="374b", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="0483", ATTR{idProduct}=="374b", MODE="0664", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="3752", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="0483", ATTR{idProduct}=="3752", MODE="0664", GROUP="plugdev"

# === ST-Link V3 ===
KERNEL=="hidraw*", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="374d", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="0483", ATTR{idProduct}=="374d", MODE="0664", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="374e", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="0483", ATTR{idProduct}=="374e", MODE="0664", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="374f", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="0483", ATTR{idProduct}=="374f", MODE="0664", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="3753", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="0483", ATTR{idProduct}=="3753", MODE="0664", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="3754", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="0483", ATTR{idProduct}=="3754", MODE="0664", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="3755", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="0483", ATTR{idProduct}=="3755", MODE="0664", GROUP="plugdev"
KERNEL=="hidraw*", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="3757", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="0483", ATTR{idProduct}=="3757", MODE="0664", GROUP="plugdev"

# === RadioOperator STM32F103C8T6 CMSIS-DAP SWO ===
KERNEL=="hidraw*", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="572a", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="0483", ATTR{idProduct}=="572a", MODE="0664", GROUP="plugdev"

# === Essemi ESLinkII ===
KERNEL=="hidraw*", ATTRS{idVendor}=="30cc", ATTRS{idProduct}=="9527", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="30cc", ATTR{idProduct}=="9527", MODE="0664", GROUP="plugdev"

# === SEGGER J-Link (all models) ===
KERNEL=="hidraw*", ATTRS{idVendor}=="1366", MODE="0664", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="1366", MODE="0664", GROUP="plugdev"
'';
```

## Probes covered

| Probe | VID | PID | Source |
|---|---|---|---|
| DAPLink | `0d28` | `0204` | pyOCD |
| Picoprobe | `2e8a` | `0004` | pyOCD |
| RP2040 OpenOCD | `2e8a` | `000c` | — |
| RP2040 Picoprobe CDC | `2e8a` | `f00a` | — |
| Keil ULINKplus | `c251` | `2750` | pyOCD |
| NXP LPC-LinkII | `1fc9` | `0090` | pyOCD |
| NXP MCU-Link | `1fc9` | `0143` | pyOCD |
| Microchip EDBG | `03eb` | `2111` | pyOCD |
| Microchip JTAGICE3 | `03eb` | `2140` | pyOCD |
| Microchip Atmel-ICE | `03eb` | `2141` | pyOCD |
| Microchip Power Debugger | `03eb` | `2144` | pyOCD |
| Microchip mEDBG | `03eb` | `2145` | pyOCD |
| Microchip EDBGC | `03eb` | `216c` | pyOCD |
| Microchip nEDBG | `03eb` | `2175` | pyOCD |
| Cypress KitProg1/2 | `04b4` | `f138`, `f148` | pyOCD |
| Cypress MiniProg4 | `04b4` | `f151`, `f152` | pyOCD |
| Cypress KitProg3 | `04b4` | `f154`, `f155`, `f166` | pyOCD |
| ST-Link V2 | `0483` | `3748` | pyOCD |
| ST-Link V2-1 | `0483` | `374b`, `3752` | pyOCD |
| ST-Link V3 | `0483` | `374d`–`3757` | pyOCD |
| RadioOperator CMSIS-DAP SWO | `0483` | `572a` | pyOCD |
| Essemi ESLinkII | `30cc` | `9527` | pyOCD |
| SEGGER J-Link (all) | `1366` | * | SEGGER |