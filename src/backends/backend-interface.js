export class ProbeBackend {
  /** @returns {Promise<any>} */
  async requestDevice() {
    throw new Error("requestDevice() not implemented");
  }

  /** @returns {Promise<any[]>} */
  async getAuthorizedDevices() {
    return [];
  }

  /** @returns {Promise<void>} */
  async connect() {
    throw new Error("connect() not implemented");
  }

  /** @returns {Promise<void>} */
  async disconnect() {
    throw new Error("disconnect() not implemented");
  }

  /** @returns {Promise<any>} */
  async getProbeInfo() {
    throw new Error("getProbeInfo() not implemented");
  }

  /** @returns {Promise<any>} */
  async getTargetInfo() {
    throw new Error("getTargetInfo() not implemented");
  }

  /** @returns {Promise<any>} */
  async readMemory() {
    throw new Error("readMemory() not implemented");
  }

  /** @returns {Promise<void>} */
  async programImage() {
    throw new Error("programImage() not implemented");
  }

  /** @returns {Promise<void>} */
  async verifyImage() {
    throw new Error("verifyImage() not implemented");
  }

  /** @returns {Promise<any>} */
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
