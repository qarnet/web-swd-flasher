import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { persistInput } from "../../src/ui/components/persist-input.js";

test("persistInput loads saved value", () => {
  makeDom("<div></div>");
  try {
    localStorage.setItem("my-key", "hello");
    const el = document.createElement("input");
    el.value = "default";
    persistInput(el, "my-key");
    assert.equal(el.value, "hello");
  } finally {
    teardownDom();
  }
});

test("persistInput defaults to element value when no saved", () => {
  makeDom("<div></div>");
  try {
    const el = document.createElement("input");
    el.value = "default";
    persistInput(el, "other-key");
    assert.equal(el.value, "default");
  } finally {
    teardownDom();
  }
});
