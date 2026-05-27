export const ErrorCode = {
  PERMISSION_DENIED: "PERMISSION_DENIED",
  DEVICE_NOT_FOUND: "DEVICE_NOT_FOUND",
  CONNECT_FAILED: "CONNECT_FAILED",
  UNSUPPORTED: "UNSUPPORTED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNKNOWN: "UNKNOWN"
};

export function normalizeError(error) {
  const message = error?.message || String(error);
  if (/denied|cancel|abort/i.test(message)) {
    return { code: ErrorCode.PERMISSION_DENIED, message };
  }
  if (/not found|no device/i.test(message)) {
    return { code: ErrorCode.DEVICE_NOT_FOUND, message };
  }
  if (/unsupported/i.test(message)) {
    return { code: ErrorCode.UNSUPPORTED, message };
  }
  return { code: ErrorCode.UNKNOWN, message };
}
