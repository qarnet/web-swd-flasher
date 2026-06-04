import { Nrf52FlashProgrammer } from "../backends/cmsis-dap/flash-nrf52.js";

export const PROGRAMMERS = {
  "nvmc-nrf52": ({ adi, bus }) => new Nrf52FlashProgrammer(bus, adi),
};

export function createFlashProgrammer(target, deps) {
  const factory = PROGRAMMERS[target.programmer];
  if (!factory) throw new Error(`No flash programmer for ${target.programmer}`);
  return factory(deps);
}
