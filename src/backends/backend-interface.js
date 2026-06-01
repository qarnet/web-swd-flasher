export class ProbeBackend {
  async requestDevice() {
    throw new Error("requestDevice() not implemented");
  }

  async getAuthorizedDevices() {
    return [];
  }

  async connect() {
    throw new Error("connect() not implemented");
  }

  async disconnect() {
    throw new Error("disconnect() not implemented");
  }

  async getProbeInfo() {
    throw new Error("getProbeInfo() not implemented");
  }

  async getTargetInfo() {
    throw new Error("getTargetInfo() not implemented");
  }

  async readMemory() {
    throw new Error("readMemory() not implemented");
  }

  async programImage() {
    throw new Error("programImage() not implemented");
  }

  async verifyImage() {
    throw new Error("verifyImage() not implemented");
  }

  async reset() {
    throw new Error("reset() not implemented");
  }

  get activeTarget() {
    return null;
  }

  get availableTargets() {
    return [];
  }

  capabilities() {
    return {
      supportsReadMemory: false,
      supportsFlash: false,
      supportsVerify: false,
      supportsReset: false
    };
  }

  getMemoryAccess() {
    return {
      readMem32: () => { throw new Error("readMem32 not implemented"); },
      writeMem32: () => { throw new Error("writeMem32 not implemented"); },
      readBlockFast: () => { throw new Error("readBlockFast not implemented"); },
      maxReadBlockWordCount: 0,
    };
  }

  createRttSession() {
    return null;
  }

  getCortex() {
    return null;
  }

  getRecovery() {
    return null;
  }

  async withQuietLog(fn) {
    return fn();
  }
}
