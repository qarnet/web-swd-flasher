export const VERBOSE = process.argv.includes("--verbose");
export const FLASH_TEST = process.argv.includes("--flash-test");
export const RECOVERY_TEST = process.argv.includes("--recovery-test");

export function skipNoProbe(probeError) {
  return { skip: `No probe: ${probeError}` };
}

export function skipUnless(flag, flagName) {
  return flag ? null : { skip: `Pass --${flagName} to enable (destructive)` };
}