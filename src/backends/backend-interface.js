export class ProbeBackend {
  async requestDevice() {
    throw new Error("requestDevice() not implemented");
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

  capabilities() {
    return {
      supportsReadMemory: false,
      supportsFlash: false,
      supportsVerify: false,
      supportsReset: false
    };
  }
}
