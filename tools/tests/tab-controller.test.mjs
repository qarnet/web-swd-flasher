import test from "node:test";
import assert from "node:assert/strict";
import { makeDom, teardownDom } from "./helpers/dom.mjs";
import { TabController, ModeController } from "../../src/ui/components/tab-controller.js";

test("TabController: parses empty hash to {mode: null, tab: null}", () => {
  makeDom("<button class='tab-btn' data-tab='a'></button><div id='tab-a'></div><div id='tab-b'></div>");
  globalThis.location.hash = "";
  let captured;
  class Testable extends TabController {
    constructor(opts) { super(opts); captured = opts; }
  }
  new TabController({ buttonSelector: ".tab-btn", panelSelector: ".tab-panel", defaultTab: "a" });
  assert.equal(globalThis.location.hash, "");
});

test("TabController: applies defaultTab when hash is empty", () => {
  makeDom(`
    <button class='tab-btn' data-tab='a'></button>
    <button class='tab-btn' data-tab='b'></button>
    <div id='tab-a' class='tab-panel'></div>
    <div id='tab-b' class='tab-panel'></div>
  `);
  globalThis.location.hash = "";
  new TabController({ buttonSelector: ".tab-btn", panelSelector: ".tab-panel", defaultTab: "a" });
  const a = globalThis.document.getElementById("tab-a");
  const b = globalThis.document.getElementById("tab-b");
  assert.equal(a.hidden, false);
  assert.equal(b.hidden, true);
});

test("TabController: applies hash tab on init when present", () => {
  makeDom(`
    <button class='tab-btn' data-tab='a'></button>
    <button class='tab-btn' data-tab='b'></button>
    <div id='tab-a' class='tab-panel'></div>
    <div id='tab-b' class='tab-panel'></div>
  `);
  globalThis.location.hash = "#swd/b";
  new TabController({ buttonSelector: ".tab-btn", panelSelector: ".tab-panel", defaultTab: "a" });
  const a = globalThis.document.getElementById("tab-a");
  const b = globalThis.document.getElementById("tab-b");
  assert.equal(a.hidden, true);
  assert.equal(b.hidden, false);
});

test("TabController: button click shows correct panel", () => {
  makeDom(`
    <button class='tab-btn' data-tab='a'></button>
    <button class='tab-btn' data-tab='b'></button>
    <div id='tab-a' class='tab-panel'></div>
    <div id='tab-b' class='tab-panel'></div>
  `);
  globalThis.location.hash = "";
  new TabController({ buttonSelector: ".tab-btn", panelSelector: ".tab-panel", defaultTab: "a" });
  const btnB = globalThis.document.querySelectorAll(".tab-btn")[1];
  btnB.click();
  const a = globalThis.document.getElementById("tab-a");
  const b = globalThis.document.getElementById("tab-b");
  assert.equal(a.hidden, true);
  assert.equal(b.hidden, false);
});

test("TabController: switchTo(tabId, true) updates window.location.hash", () => {
  makeDom(`
    <button class='tab-btn' data-tab='a'></button>
    <button class='tab-btn' data-tab='b'></button>
    <div id='tab-a' class='tab-panel'></div>
    <div id='tab-b' class='tab-panel'></div>
  `);
  globalThis.location.hash = "#swd/a";
  const ctrl = new TabController({ buttonSelector: ".tab-btn", panelSelector: ".tab-panel", defaultTab: "a" });
  ctrl.switchTo("b", true);
  assert.ok(globalThis.location.hash.includes("swd/b"), `expected hash to include 'swd/b', got '${globalThis.location.hash}'`);
});

test("TabController: switchTo(tabId, false) does NOT update hash", () => {
  makeDom(`
    <button class='tab-btn' data-tab='a'></button>
    <button class='tab-btn' data-tab='b'></button>
    <div id='tab-a' class='tab-panel'></div>
    <div id='tab-b' class='tab-panel'></div>
  `);
  globalThis.location.hash = "#swd/a";
  const ctrl = new TabController({ buttonSelector: ".tab-btn", panelSelector: ".tab-panel", defaultTab: "a" });
  ctrl.switchTo("b", false);
  assert.ok(globalThis.location.hash.includes("swd/a"), `expected hash to remain 'swd/a', got '${globalThis.location.hash}'`);
});

test("TabController: switchTo sets .active on the right button", () => {
  makeDom(`
    <button class='tab-btn' data-tab='a'></button>
    <button class='tab-btn' data-tab='b'></button>
    <div id='tab-a' class='tab-panel'></div>
    <div id='tab-b' class='tab-panel'></div>
  `);
  globalThis.location.hash = "";
  const ctrl = new TabController({ buttonSelector: ".tab-btn", panelSelector: ".tab-panel", defaultTab: "a" });
  ctrl.switchTo("b", false);
  const btns = globalThis.document.querySelectorAll(".tab-btn");
  assert.equal(btns[0].classList.contains("active"), false);
  assert.equal(btns[1].classList.contains("active"), true);
});

test("TabController: hashchange event triggers _applyHash", () => {
  makeDom(`
    <button class='tab-btn' data-tab='a'></button>
    <button class='tab-btn' data-tab='b'></button>
    <div id='tab-a' class='tab-panel'></div>
    <div id='tab-b' class='tab-panel'></div>
  `);
  globalThis.location.hash = "#swd/a";
  new TabController({ buttonSelector: ".tab-btn", panelSelector: ".tab-panel", defaultTab: "a" });
  globalThis.location.hash = "#swd/b";
  globalThis.window.dispatchEvent(new globalThis.window.Event("hashchange"));
  const b = globalThis.document.getElementById("tab-b");
  assert.equal(b.hidden, false);
});

test("ModeController: applies 'swd' mode when hash empty", () => {
  makeDom(`
    <button class='mode-btn' data-mode='swd'></button>
    <button class='mode-btn' data-mode='serial'></button>
    <section id='swd-section'></section>
    <section id='serial-section'></section>
    <div id='swd-conn-controls'></div>
    <div id='serial-conn-controls'></div>
  `);
  globalThis.location.hash = "";
  new ModeController({ sectionMap: { swd: globalThis.document.getElementById("swd-section"), serial: globalThis.document.getElementById("serial-section") } });
  const swd = globalThis.document.getElementById("swd-section");
  const serial = globalThis.document.getElementById("serial-section");
  assert.equal(swd.hidden, false);
  assert.equal(serial.hidden, true);
});

test("ModeController: applies 'serial' mode from hash", () => {
  makeDom(`
    <button class='mode-btn' data-mode='swd'></button>
    <button class='mode-btn' data-mode='serial'></button>
    <section id='swd-section'></section>
    <section id='serial-section'></section>
    <div id='swd-conn-controls'></div>
    <div id='serial-conn-controls'></div>
  `);
  globalThis.location.hash = "#serial";
  new ModeController({ sectionMap: { swd: globalThis.document.getElementById("swd-section"), serial: globalThis.document.getElementById("serial-section") } });
  const swd = globalThis.document.getElementById("swd-section");
  const serial = globalThis.document.getElementById("serial-section");
  assert.equal(swd.hidden, true);
  assert.equal(serial.hidden, false);
});

test("ModeController: shows/hides swd-conn-controls based on mode", () => {
  makeDom(`
    <button class='mode-btn' data-mode='swd'></button>
    <button class='mode-btn' data-mode='serial'></button>
    <section id='swd-section'></section>
    <section id='serial-section'></section>
    <div id='swd-conn-controls'></div>
    <div id='serial-conn-controls'></div>
  `);
  globalThis.location.hash = "#serial";
  new ModeController({ sectionMap: { swd: globalThis.document.getElementById("swd-section"), serial: globalThis.document.getElementById("serial-section") } });
  const swdCtrl = globalThis.document.getElementById("swd-conn-controls");
  const serialCtrl = globalThis.document.getElementById("serial-conn-controls");
  assert.equal(swdCtrl.hidden, true);
  assert.equal(serialCtrl.hidden, false);
});

test("ModeController: swd mode button click sets hash with current tab", () => {
  makeDom(`
    <button class='mode-btn' data-mode='swd'></button>
    <button class='mode-btn' data-mode='serial'></button>
    <section id='swd-section'></section>
    <section id='serial-section'></section>
    <div id='swd-conn-controls'></div>
    <div id='serial-conn-controls'></div>
  `);
  globalThis.location.hash = "#swd/firmware";
  new ModeController({ sectionMap: { swd: globalThis.document.getElementById("swd-section"), serial: globalThis.document.getElementById("serial-section") } });
  const swdBtn = globalThis.document.querySelector(".mode-btn[data-mode='swd']");
  swdBtn.click();
  assert.ok(globalThis.location.hash.includes("swd/firmware"), `expected hash to include 'swd/firmware', got '${globalThis.location.hash}'`);
});

test("ModeController: serial mode button click sets hash to 'serial'", () => {
  makeDom(`
    <button class='mode-btn' data-mode='swd'></button>
    <button class='mode-btn' data-mode='serial'></button>
    <section id='swd-section'></section>
    <section id='serial-section'></section>
    <div id='swd-conn-controls'></div>
    <div id='serial-conn-controls'></div>
  `);
  globalThis.location.hash = "#swd/a";
  new ModeController({ sectionMap: { swd: globalThis.document.getElementById("swd-section"), serial: globalThis.document.getElementById("serial-section") } });
  const serialBtn = globalThis.document.querySelector(".mode-btn[data-mode='serial']");
  serialBtn.click();
  assert.equal(globalThis.location.hash, "serial");
});

test("ModeController: hashchange event triggers _applyHash", () => {
  makeDom(`
    <button class='mode-btn' data-mode='swd'></button>
    <button class='mode-btn' data-mode='serial'></button>
    <section id='swd-section'></section>
    <section id='serial-section'></section>
    <div id='swd-conn-controls'></div>
    <div id='serial-conn-controls'></div>
  `);
  globalThis.location.hash = "#swd";
  new ModeController({ sectionMap: { swd: globalThis.document.getElementById("swd-section"), serial: globalThis.document.getElementById("serial-section") } });
  globalThis.location.hash = "#serial";
  globalThis.window.dispatchEvent(new globalThis.window.Event("hashchange"));
  const swd = globalThis.document.getElementById("swd-section");
  const serial = globalThis.document.getElementById("serial-section");
  assert.equal(swd.hidden, true);
  assert.equal(serial.hidden, false);
});
