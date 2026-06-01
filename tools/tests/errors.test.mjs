import test from "node:test";
import assert from "node:assert/strict";
import { normalizeError, ErrorCode } from "../../src/core/errors.js";

test("normalizeError returns PERMISSION_DENIED for denied errors", () => {
  const result = normalizeError(new Error("User denied permission"));
  assert.equal(result.code, ErrorCode.PERMISSION_DENIED);
  assert.ok(result.message.includes("denied"));
});

test("normalizeError returns PERMISSION_DENIED for cancel", () => {
  const result = normalizeError(new Error("User cancelled"));
  assert.equal(result.code, ErrorCode.PERMISSION_DENIED);
});

test("normalizeError returns PERMISSION_DENIED for abort", () => {
  const result = normalizeError(new Error("Request was aborted"));
  assert.equal(result.code, ErrorCode.PERMISSION_DENIED);
});

test("normalizeError returns DEVICE_NOT_FOUND for not found", () => {
  const result = normalizeError(new Error("No device found"));
  assert.equal(result.code, ErrorCode.DEVICE_NOT_FOUND);
});

test("normalizeError returns DEVICE_NOT_FOUND for no device", () => {
  const result = normalizeError(new Error("No device"));
  assert.equal(result.code, ErrorCode.DEVICE_NOT_FOUND);
});

test("normalizeError returns UNSUPPORTED for unsupported", () => {
  const result = normalizeError(new Error("Operation unsupported"));
  assert.equal(result.code, ErrorCode.UNSUPPORTED);
});

test("normalizeError returns UNKNOWN for other errors", () => {
  const result = normalizeError(new Error("Something went wrong"));
  assert.equal(result.code, ErrorCode.UNKNOWN);
});

test("normalizeError handles string input", () => {
  const result = normalizeError("plain string error");
  assert.equal(result.code, ErrorCode.UNKNOWN);
  assert.equal(result.message, "plain string error");
});

test("normalizeError handles null input", () => {
  const result = normalizeError(null);
  assert.equal(result.code, ErrorCode.UNKNOWN);
  assert.equal(result.message, "null");
});

test("normalizeError handles undefined input", () => {
  const result = normalizeError(undefined);
  assert.equal(result.code, ErrorCode.UNKNOWN);
});