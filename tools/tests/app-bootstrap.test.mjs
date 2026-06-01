import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";

test("app.js bootstrap: all critical imports resolve", async () => {
  makeDom("<div></div>");
  let thrown = null;
  try {
    await import("../../src/core/backend-manager.js");
    await import("../../src/core/event-bus.js");
    await import("../../src/core/event-bus-topics.js");
    await import("../../src/core/read-regions-store.js");
    await import("../../src/core/serial-manager.js");
    await import("../../src/ui/flash-visualizer.js");
    await import("../../src/hex/image-map.js");
    await import("../../src/build-info.js");
    await import("../../src/ui/panels/swd-recovery-panel.js");
    await import("../../src/ui/panels/swd-uicr-panel.js");
    await import("../../src/ui/panels/swd-debug-panel.js");
    await import("../../src/ui/panels/swd-memory-panel.js");
    await import("../../src/ui/panels/swd-rtt-panel.js");
    await import("../../src/ui/panels/swd-firmware-panel.js");
    await import("../../src/ui/panels/swd-connection-panel.js");
    await import("../../src/ui/panels/serial-connection-panel.js");
    await import("../../src/ui/panels/serial-terminal-panel.js");
    await import("../../src/ui/components/panel-logger.js");
    await import("../../src/ui/components/tab-controller.js");
    await import("../../src/ui/components/topbar-build-badge.js");
    await import("../../src/ui/logger.js");
    await import("../../src/backends/cmsis-dap/backend.js");
    await import("../../src/backends/cmsis-dap/transport-webusb.js");
    await import("../../src/backends/cmsis-dap/dap-core.js");
    await import("../../src/backends/cmsis-dap/dap-cortex.js");
    await import("../../src/backends/cmsis-dap/flash-nrf52.js");
    await import("../../src/backends/cmsis-dap/nrf52-recovery.js");
    await import("../../src/rtt/rtt-client.js");
    await import("../../src/targets/target-registry.js");
    await import("../../src/targets/flash-programmer-registry.js");
    await import("../../src/arch/cortex-m.js");
    await import("../../src/backends/backend-registry.js");
    await import("../../src/backends/mock-backend.js");
    await import("../../src/hex/intel-hex-parser.js");
    await import("../../src/hex/intel-hex-encoder.js");
    await import("../../src/hex/multi-hex-merger.js");
    await import("../../src/nrf/nrf52-memory-map.js");
    await import("../../src/nrf/nrf52-ficr.js");
    await import("../../src/nrf/nrf52-uicr-map.js");
    await import("../../src/backends/jlink-webusb/backend.js");
    await import("../../src/backends/jlink-webusb/client.js");
    await import("../../src/backends/jlink-webusb/flasher.js");
    await import("../../src/backends/jlink-webusb/transport.js");
  } catch (e) {
    thrown = e;
  } finally {
    teardownDom();
  }
  assert.equal(thrown, null, `import threw: ${thrown?.stack}`);
});
