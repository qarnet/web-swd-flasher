#!/usr/bin/env node
// Comprehensive browser test suite for web-swd-flasher.
// Uses mock backend — no hardware required.
//
// Usage:
//   APP_URL=http://localhost:8000 node browser-tests.mjs
//   BACKEND=mock HEADLESS=1 APP_URL=http://localhost:8000 node browser-tests.mjs

import puppeteer from "puppeteer";

const APP_URL = process.env.APP_URL || "http://localhost:8000";
const HEADLESS = process.env.HEADLESS !== "0";
const CHROME_BIN = process.env.PUPPETEER_CHROME || undefined;

let passed = 0;
let failed = 0;
const failures = [];

function pass(name) { console.log(`  ok  ${name}`); passed++; }
function fail(name, err) { console.error(`  FAIL ${name}: ${err?.message ?? err}`); failures.push({ name, error: err?.message ?? String(err) }); failed++; }

async function runTest(name, fn) {
  try { await fn(); pass(name); } catch (err) { fail(name, err); }
}

async function switchTab(page, tabName) {
  await page.evaluate((name) => {
    const btns = document.querySelectorAll("#section-swd .tab-btn");
    const panels = document.querySelectorAll("#section-swd .tab-panel");
    btns.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    panels.forEach(p => { p.hidden = p.id !== `tab-${name}`; });
  }, tabName);
}

async function switchMode(page, mode) {
  await page.evaluate((m) => {
    const btns = document.querySelectorAll(".mode-btn");
    btns.forEach(b => b.classList.toggle("active", b.dataset.mode === m));
    document.getElementById("section-swd").hidden = m !== "swd";
    document.getElementById("section-serial").hidden = m !== "serial";
  }, mode);
}

async function connectMock(page) {
  await page.select("#backend-select", "mock");
  await page.click("#btn-connect");
  // Wait for connect to complete
  await page.waitForFunction(() => {
    const el = document.getElementById("btn-disconnect");
    return el && !el.disabled;
  }, { timeout: 10000 });
}

async function main() {
  console.log(`\nBrowser E2E tests — ${APP_URL}\n`);

  const browser = await puppeteer.launch({
    headless: HEADLESS ? "new" : false,
    executablePath: CHROME_BIN,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    page.on("console", () => {});
    await page.goto(APP_URL, { waitUntil: "networkidle0", timeout: 20000 });

    // ── Section 1: App load ───────────────────────────────────

    console.log("── App load ──");
    await runTest("app loads without JS errors", async () => {
      const errors = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await new Promise(r => setTimeout(r, 1000));
      if (errors.length > 0) throw new Error(`JS errors: ${errors.join("; ")}`);
    });

    await runTest("compat banner is hidden", async () => {
      const hidden = await page.$eval("#compat-banner", el => el.hidden);
      if (!hidden) throw new Error("compat banner visible");
    });

    await runTest("connect button enabled on load", async () => {
      const d = await page.$eval("#btn-connect", el => el.disabled);
      if (d) throw new Error("connect button disabled");
    });

    await runTest("disconnect button disabled on load", async () => {
      const d = await page.$eval("#btn-disconnect", el => el.disabled);
      if (!d) throw new Error("disconnect button should be disabled");
    });

    await runTest("status shows Idle on load", async () => {
      const t = await page.$eval("#status", el => el.textContent);
      if (!t.includes("Idle") && !t.includes("Ready")) throw new Error(`Unexpected: "${t}"`);
    });

    await runTest("image summary shows no image", async () => {
      const t = await page.$eval("#image-summary", el => el.textContent);
      if (!t.toLowerCase().includes("no image")) throw new Error(`Unexpected: "${t}"`);
    });

    await runTest("theme toggle switches dark/light", async () => {
      const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      await page.click("#btn-theme");
      const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      if (before === after) throw new Error("theme unchanged");
    });

    // ── Section 2: Connection ─────────────────────────────────

    console.log("\n── Connection ──");
    await runTest("backend select lists mock option", async () => {
      const vals = await page.$$eval("#backend-select option", opts => [...opts].map(o => o.value));
      if (!vals.includes("mock")) throw new Error("mock option missing");
    });

    await runTest("clock select persists to localStorage", async () => {
      await page.select("#clock-select", "500000");
      const v = await page.evaluate(() => localStorage.getItem("swd-clock-hz"));
      if (v !== "500000") throw new Error(`Expected 500000, got ${v}`);
    });

    await runTest("clock value restored on reload", async () => {
      await page.select("#clock-select", "2000000");
      await page.reload({ waitUntil: "networkidle0" });
      await new Promise(r => setTimeout(r, 500));
      const v = await page.$eval("#clock-select", el => el.value);
      if (v !== "2000000") throw new Error(`Expected 2000000, got ${v}`);
    });

    await runTest("connect with mock backend succeeds", async () => {
      await connectMock(page);
      const d = await page.$eval("#btn-disconnect", el => el.disabled);
      if (d) throw new Error("disconnect still disabled after connect");
    });

    await runTest("disconnect resets state", async () => {
      await page.click("#btn-disconnect");
      await new Promise(r => setTimeout(r, 500));
      const d = await page.$eval("#btn-connect", el => el.disabled);
      if (d) throw new Error("connect button should be re-enabled");
    });

    // Reconnect for remaining tests
    await connectMock(page);

    // ── Section 3: Recovery panel ─────────────────────────────

    console.log("\n── Recovery panel ──");
    await runTest("recovery buttons enabled after connect", async () => {
      await switchTab(page, "recovery");
      const check = await page.$eval("#btn-check-protection", el => el.disabled);
      const recover = await page.$eval("#btn-recover", el => el.disabled);
      if (check || recover) throw new Error("recovery buttons disabled after connect");
    });

    // ── Section 4: Firmware panel ──────────────────────────────

    console.log("\n── Firmware panel ──");
    await runTest("firmware operations buttons disabled without image", async () => {
      await switchTab(page, "firmware");
      const d = await page.$eval("#btn-program", el => el.disabled);
      if (!d) throw new Error("program button should be disabled without image");
    });

    await runTest("confirm checkbox persists checked state", async () => {
      await page.click("#chk-confirm-program");
      const checked = await page.$eval("#chk-confirm-program", el => el.checked);
      if (!checked) throw new Error("checkbox not checked after click");
    });

    await runTest("clear hex button does not crash", async () => {
      await page.click("#btn-clear-hex");
      const summary = await page.$eval("#image-summary", el => el.textContent);
      // Should still report no image after clear
      if (!summary.toLowerCase().includes("no image")) throw new Error("unexpected summary after clear");
    });

    // ── Section 5: Debug panel ─────────────────────────────────

    console.log("\n── Debug panel ──");
    await runTest("debug buttons enabled after connect", async () => {
      await switchTab(page, "debug");
      const ids = ["btn-core-halt", "btn-core-resume", "btn-core-step", "btn-core-regs"];
      for (const id of ids) {
        const d = await page.$eval(`#${id}`, el => el.disabled);
        if (d) throw new Error(`#${id} disabled after connect`);
      }
    });

    // ── Section 6: Memory panel ────────────────────────────────

    console.log("\n── Memory panel ──");
    await runTest("memory read button enabled after connect", async () => {
      await switchTab(page, "memory");
      const d = await page.$eval("#btn-mem-read", el => el.disabled);
      if (d) throw new Error("btn-mem-read disabled after connect");
    });

    await runTest("memory address and length inputs persist", async () => {
      // Trigger change event so persistInput saves
      await page.focus("#mem-addr-input");
      await page.evaluate(() => {
        const el = document.getElementById("mem-addr-input");
        el.value = "0x20000000";
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.focus("#mem-len-input");
      await page.evaluate(() => {
        const el = document.getElementById("mem-len-input");
        el.value = "128";
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await new Promise(r => setTimeout(r, 100));
      const addr = await page.evaluate(() => localStorage.getItem("mem-addr"));
      const len = await page.evaluate(() => localStorage.getItem("mem-len"));
      if (addr !== "0x20000000") throw new Error(`addr: ${addr}`);
      if (len !== "128") throw new Error(`len: ${len}`);
    });

    // ── Section 7: UICR panel ──────────────────────────────────

    console.log("\n── UICR panel ──");
    await runTest("UICR read button enabled after connect", async () => {
      await switchTab(page, "uicr");
      const d = await page.$eval("#btn-uicr-read", el => el.disabled);
      if (d) throw new Error("btn-uicr-read disabled after connect");
    });

    // ── Section 8: RTT panel ───────────────────────────────────

    console.log("\n── RTT panel ──");
    await runTest("RTT clear button clears log", async () => {
      await switchTab(page, "rtt");
      await page.evaluate(() => { document.getElementById("rtt-log").textContent = "test log"; });
      await page.click("#btn-rtt-clear");
      const t = await page.$eval("#rtt-log", el => el.textContent);
      if (t !== "") throw new Error(`rtt-log not cleared: "${t}"`);
    });

    await runTest("RTT inputs persist to localStorage", async () => {
      async function setAndChange(sel, val) {
        await page.focus(sel);
        await page.evaluate((s, v) => {
          const el = document.querySelector(s);
          el.value = v;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }, sel, val);
      }
      await setAndChange("#rtt-ram-start", "0x20005000");
      await setAndChange("#rtt-ram-size", "128");
      await setAndChange("#rtt-interval", "100");
      await new Promise(r => setTimeout(r, 100));
      const start = await page.evaluate(() => localStorage.getItem("rtt-ram-start"));
      const size = await page.evaluate(() => localStorage.getItem("rtt-ram-size"));
      const interval = await page.evaluate(() => localStorage.getItem("rtt-interval"));
      if (start !== "0x20005000") throw new Error(`start: ${start}`);
      if (size !== "128") throw new Error(`size: ${size}`);
      if (interval !== "100") throw new Error(`interval: ${interval}`);
    });

    // ── Section 9: Event log ───────────────────────────────────

    console.log("\n── Event log ──");
    await runTest("event log toggles collapsed on click", async () => {
      await switchTab(page, "connection");
      const wasCollapsed = await page.$eval("#log", el => el.classList.contains("log-collapsed"));
      await page.click("#log");
      const nowCollapsed = await page.$eval("#log", el => el.classList.contains("log-collapsed"));
      if (wasCollapsed === nowCollapsed) throw new Error("log did not toggle");
    });

    await runTest("clear log button clears log", async () => {
      await page.click("#btn-log-clear");
      const t = await page.$eval("#log", el => el.textContent);
      if (t !== "") throw new Error(`log not cleared: "${t}"`);
    });

    // ── Section 10: Serial section ──────────────────────────────

    console.log("\n── Serial section ──");
    await runTest("switch to serial mode shows serial section", async () => {
      await switchMode(page, "serial");
      const hidden = await page.$eval("#section-serial", el => el.hidden);
      if (hidden) throw new Error("serial section still hidden after switch");
    });

    await runTest("switch back to SWD mode shows SWD section", async () => {
      await switchMode(page, "swd");
      const hidden = await page.$eval("#section-swd", el => el.hidden);
      if (hidden) throw new Error("swd section still hidden after switch");
      const serialHidden = await page.$eval("#section-serial", el => el.hidden);
      if (!serialHidden) throw new Error("serial section visible in swd mode");
    });

    await runTest("serial connect button visible", async () => {
      await switchMode(page, "serial");
      const hidden = await page.$eval("#btn-serial-connect", el => {
        return !el.offsetParent;  // check if visible in DOM
      });
      if (hidden) throw new Error("serial connect button not visible");
    });

    await runTest("serial baud select saves to localStorage", async () => {
      await page.select("#serial-baud-select", "921600");
      const v = await page.evaluate(() => localStorage.getItem("serial-baud"));
      if (v !== "921600") throw new Error(`Expected 921600, got ${v}`);
    });

    await runTest("serial clear button clears terminal", async () => {
      await page.evaluate(() => { document.getElementById("serial-term-log").textContent = "test"; });
      await page.click("#btn-serial-clear");
      const t = await page.$eval("#serial-term-log", el => el.textContent);
      if (t !== "") throw new Error(`serial-term-log not cleared: "${t}"`);
    });

    // ── Section 11: Disconnect resets panels ───────────────────

    console.log("\n── Disconnect reset ──");
    await runTest("connect then disconnect cleans up panels", async () => {
      await switchMode(page, "swd");
      await switchTab(page, "connection");
      await connectMock(page);
      // Disconnect
      await page.click("#btn-disconnect");
      await new Promise(r => setTimeout(r, 500));

      // Check recovery tab
      await switchTab(page, "recovery");
      const recoveryBtn = await page.$eval("#btn-check-protection", el => el.disabled);
      if (!recoveryBtn) throw new Error("recovery button not disabled after disconnect");

      // Check debug tab
      await switchTab(page, "debug");
      const debugBtn = await page.$eval("#btn-core-halt", el => el.disabled);
      if (!debugBtn) throw new Error("debug button not disabled after disconnect");
    });

  } finally {
    await browser.close();
  }

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  • ${f.name}: ${f.error}`);
  }
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error(`Fatal: ${err.message}`); process.exit(1); });
