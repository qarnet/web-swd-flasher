import { buildImageMap, formatImageMap } from "../../hex/image-map.js";

export class TargetInfoView {
  static render(container, probe, target) {
    const lines = [];
    lines.push(`Backend: ${probe.backend}`);
    lines.push(`Probe: ${probe.name || "unknown"}`);
    if (probe.manufacturer) lines.push(`Manufacturer: ${probe.manufacturer}`);
    if (probe.transport) lines.push(`Transport: ${probe.transport}`);
    if (probe.packetSize) lines.push(`Packet size: ${probe.packetSize}`);
    lines.push(`Target family: ${target.family || "unknown"}`);
    lines.push(`Target part: ${target.part || "unknown"}`);
    if (target.dpidr) lines.push(`DPIDR: ${target.dpidr}`);
    if (target.flash) {
      const mb = (target.flash.size / 1024 / 1024).toFixed(3);
      lines.push(`Flash: 0x${target.flash.start.toString(16)} + ${mb} MB (page ${target.flash.pageSize / 1024} KB)`);
    }
    if (target.ram) {
      const kb = target.ram.size / 1024;
      lines.push(`RAM: 0x${target.ram.start.toString(16)} + ${kb} KB`);
    }
    if (target.ficr) {
      lines.push(`FICR part: 0x${target.ficr.part.toString(16)}`);
      lines.push(`FICR variant: 0x${target.ficr.variant.toString(16)}`);
      lines.push(`FICR package: 0x${target.ficr.package.toString(16)}`);
      lines.push(`FICR ram: ${target.ficr.ram}`);
      lines.push(`FICR flash: ${target.ficr.flash}`);
    }
    container.textContent = lines.join("\n");
    container.hidden = false;
  }

  static renderCaps(container, probe) {
    if (probe.capabilities === undefined) return;
    const caps = [];
    caps.push(`Capabilities: 0x${probe.capabilities.toString(16).padStart(2, "0")}`);
    caps.push(`  SWD: ${probe.hasSWD ? "yes" : "no"}`);
    caps.push(`  JTAG: ${probe.hasJTAG ? "yes" : "no"}`);
    caps.push(`  SWO UART: ${probe.hasSWO_UART ? "yes" : "no"}`);
    caps.push(`  SWO Manchester: ${probe.hasSWO_Manchester ? "yes" : "no"}`);
    caps.push(`  Atomic Commands: ${probe.hasAtomicCommands ? "yes" : "no"}`);
    caps.push(`  Test Domain Timer: ${probe.hasTestDomainTimer ? "yes" : "no"}`);
    caps.push(`  SWO Streaming: ${probe.hasSWO_Streaming ? "yes" : "no"}`);
    caps.push(`  UART Port: ${probe.hasUART ? "yes" : "no"}`);
    caps.push(`Max packet count: ${probe.maxPacketCount}`);
    caps.push(`Max packet size: ${probe.maxPacketSize}`);
    container.textContent = caps.join("\n");
    container.hidden = false;
  }
}
