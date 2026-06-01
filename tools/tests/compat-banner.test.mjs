import test from "node:test";
import assert from "node:assert/strict";
import { CompatBanner } from "../../src/ui/components/compat-banner.js";

test("CompatBanner.render shows banner when not ok", () => {
  const bannerEl = { hidden: true };
  const msgEl = { textContent: "" };
  const result = CompatBanner.render(bannerEl, msgEl, { ok: false, msg: "no usb" });
  assert.equal(result, false);
  assert.equal(bannerEl.hidden, false);
  assert.equal(msgEl.textContent, "no usb");
});

test("CompatBanner.render hides banner when ok", () => {
  const bannerEl = { hidden: false };
  const msgEl = { textContent: "" };
  const result = CompatBanner.render(bannerEl, msgEl, { ok: true, msg: "" });
  assert.equal(result, true);
  assert.equal(bannerEl.hidden, true);
});
