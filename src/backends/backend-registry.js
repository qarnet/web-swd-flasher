import { CmsisDapBackend } from "./cmsis-dap/backend.js";
import { MockBackend } from "./mock-backend.js";
import { JLinkWebUsbBackend } from "./jlink-webusb/backend.js";

export const BACKENDS = {
  "cmsis-dap": (deps) => new CmsisDapBackend(deps.bus, deps.logger, deps.swdClockHz),
  "mock": (deps) => new MockBackend(deps.bus),
  "jlink-webusb": (deps) => new JLinkWebUsbBackend(deps.bus, deps.logger),
};

export function createBackend(name, deps) {
  const factory = BACKENDS[name];
  if (!factory) throw new Error(`Unknown backend: ${name}`);
  return factory(deps);
}
