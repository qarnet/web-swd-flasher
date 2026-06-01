export function makeFakeBackend(overrides = {}) {
  const noop = () => {};
  return {
    capabilities: () => ({
      supportsReadMemory: false,
      supportsFlash: false,
      supportsVerify: false,
      supportsReset: false,
      ...(overrides.capabilities ?? {}),
    }),
    getRecovery: () => (overrides.recovery ?? null),
    getCortex: () => (overrides.cortex ?? null),
    getMemoryAccess: () => (overrides.memoryAccess ?? null),
    createRttSession: () => (overrides.rttSession ?? null),
    withQuietLog: async (fn) => fn(),
    activeTarget: overrides.activeTarget ?? null,
    availableTargets: overrides.availableTargets ?? [],
    ...overrides.extra,
  };
}
