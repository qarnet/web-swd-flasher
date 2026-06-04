import test from "node:test";
import assert from "node:assert/strict";
import { TargetInfoView } from "../../src/ui/components/target-info-view.js";

test("TargetInfoView.render produces text content on container", () => {
  const container = { textContent: "", hidden: true };
  const probe = {
    backend: "cmsis-dap",
    name: "Test Probe",
    manufacturer: "Test Inc",
    transport: "webusb",
    packetSize: 64,
    maxPacketCount: 16,
    maxPacketSize: 256,
    capabilities: 0xff,
    hasSWD: true,
    hasJTAG: false,
    hasSWO_UART: false,
    hasSWO_Manchester: false,
    hasAtomicCommands: false,
    hasTestDomainTimer: false,
    hasSWO_Streaming: false,
    hasUART: false,
  };
  const target = {
    family: "nRF52",
    part: "nRF52840",
    id: "nrf52840",
    dpidr: "0x2ba01477",
    flash: { start: 0, size: 1024 * 1024, pageSize: 4096 },
    ram: { start: 0x20000000, size: 256 * 1024 },
    ficr: {
      part: 0x52840,
      variant: 0x414a4320,
      package: 0x2000,
      ram: 256,
      flash: 1024,
    },
  };
  TargetInfoView.render(container, probe, target);
  assert.ok(container.textContent.includes("Test Probe"));
  assert.ok(container.textContent.includes("nRF52840"));
  assert.ok(container.textContent.includes("FICR part"));
  assert.equal(container.hidden, false);
});

test("TargetInfoView.renderCaps renders capabilities", () => {
  const container = { textContent: "", hidden: true };
  const probe = {
    backend: "cmsis-dap",
    name: "Test",
    capabilities: 0x01,
    hasSWD: true,
    hasJTAG: false,
    hasSWO_UART: false,
    hasSWO_Manchester: false,
    hasAtomicCommands: false,
    hasTestDomainTimer: false,
    hasSWO_Streaming: false,
    hasUART: false,
    maxPacketCount: 4,
    maxPacketSize: 64,
  };
  TargetInfoView.renderCaps(container, probe);
  assert.ok(container.textContent.includes("SWD: yes"));
  assert.ok(container.textContent.includes("JTAG: no"));
  assert.ok(container.textContent.includes("Max packet count: 4"));
  assert.equal(container.hidden, false);
});

test("TargetInfoView.renderCaps does nothing when capabilities undefined", () => {
  const container = { textContent: "unchanged", hidden: true };
  const probe = { backend: "cmsis-dap", name: "Test" };
  TargetInfoView.renderCaps(container, probe);
  assert.equal(container.textContent, "unchanged");
  assert.equal(container.hidden, true);
});
