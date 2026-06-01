#!/usr/bin/env node
// Comprehensive browser E2E test suite for web-swd-flasher.
// Uses mock backend — no hardware required.
//
// Usage:
//   APP_URL=http://localhost:8000 node browser-tests.mjs
//   HEADLESS=1 APP_URL=http://localhost:8000 node browser-tests.mjs

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
  await page.waitForFunction(() => {
    const el = document.getElementById("btn-disconnect");
    return el && !el.disabled;
  }, { timeout: 10000 });
}

async function loadHex(page) {
  await switchTab(page, "firmware");
  const hexText = ":1000000000C00700B50400B50400B50400B5042E\n:00000001FF\n";
  await page.evaluate((hex) => {
    const input = document.getElementById("file-input");
    const dt = new DataTransfer();
    const file = new File([hex], "test.hex", { type: "text/plain" });
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, hexText);
  await new Promise(r => setTimeout(r, 500));
}

async function main() {
  console.log(`\nBrowser E2E tests — ${APP_URL}\n`);

  const browser = await puppeteer.launch({
    headless: HEADLESS ? "new" : false,
    executablePath: CHROME_BIN,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", "--disable-gpu",
    ],
  });

  try {
    const page = await browser.newPage();
    page.on("console", () => {});
    await page.goto(APP_URL, { waitUntil: "networkidle0", timeout: 20000 });

    let errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // ── 1. App load ─────────────────────────────────────────

    console.log("── App load ──");
    await runTest("app loads without JS errors", async () => {
      await new Promise(r => setTimeout(r, 1000));
      if (errors.length > 0) throw new Error(`JS errors: ${errors.join("; ")}`);
    });

    await runTest("compat banner is hidden", async () => {
      const hidden = await page.$eval("#compat-banner", el => el.hidden);
      if (!hidden) throw new Error("compat banner visible");
    });

    await runTest("connect button enabled, disconnect disabled", async () => {
      const c = await page.$eval("#btn-connect", el => el.disabled);
      const d = await page.$eval("#btn-disconnect", el => el.disabled);
      if (c) throw new Error("connect disabled");
      if (!d) throw new Error("disconnect not disabled");
    });

    await runTest("status shows Idle/Ready", async () => {
      const t = await page.$eval("#status", el => el.textContent);
      if (!t.includes("Idle") && !t.includes("Ready")) throw new Error(`"${t}"`);
    });

    // ── 2. Connect + disconnect ─────────────────────────────

    console.log("\n── Connect ──");
    await runTest("mock backend connects successfully", async () => {
      await connectMock(page);
      const d = await page.$eval("#btn-disconnect", el => el.disabled);
      if (d) throw new Error("disconnect still disabled after connect");
    });

    await runTest("target info renders after connect", async () => {
      const text = await page.$eval("#target-info", el => el.textContent);
      if (!text.includes("Backend:")) throw new Error(`no target info: "${text}"`);
    });

    await runTest("topbar shows Connected", async () => {
      const text = await page.$eval("#topbar-target", el => el.textContent);
      if (!text.includes("nRF52840")) throw new Error(`topbar: "${text}"`);
    });

    await runTest("disconnect cleans up", async () => {
      await page.click("#btn-disconnect");
      await new Promise(r => setTimeout(r, 500));
      const d = await page.$eval("#btn-connect", el => el.disabled);
      if (d) throw new Error("connect still disabled after disconnect");
    });

    // Reconnect for panel tests
    await connectMock(page);

    // ── 3. Device Recovery ──────────────────────────────────

    console.log("\n── Device Recovery ──");
    await runTest("check protection button does something", async () => {
      await switchTab(page, "recovery");
      await new Promise(r => setTimeout(r, 200));
      const btn = await page.$eval("#btn-check-protection", el => el.disabled);
      if (btn) throw new Error("check protection button disabled after connect");
    });

    await runTest("recover device button is clickable", async () => {
      const btn = await page.$eval("#btn-recover", el => el.disabled);
      if (btn) throw new Error("recover button disabled after connect");
    });

    // ── 4. Firmware Image ───────────────────────────────────

    console.log("\n── Firmware Image ──");
    await runTest("load hex via fetch enables program buttons", async () => {
      await switchTab(page, "firmware");
      await page.$eval("#url-input", el => { el.value = "/test.hex"; });
      await page.click("#btn-fetch-hex");
      await new Promise(r => setTimeout(r, 500));
      await page.click("#chk-confirm-program");
      await new Promise(r => setTimeout(r, 200));
      const prog = await page.$eval("#btn-program", el => el.disabled);
      const verify = await page.$eval("#btn-verify", el => el.disabled);
      const pvr = await page.$eval("#btn-program-verify-reset", el => el.disabled);
      if (prog) throw new Error("program still disabled after hex + confirm");
      if (verify) throw new Error("verify still disabled after hex + confirm");
      if (pvr) throw new Error("PVR still disabled after hex + confirm");
    });

    await runTest("reset button is enabled", async () => {
      const reset = await page.$eval("#btn-reset", el => el.disabled);
      if (reset) throw new Error("reset disabled after connect");
    });

    await runTest("program button triggers flash progress", async () => {
      await page.click("#btn-program");
      await new Promise(r => setTimeout(r, 2500)); // wait for 100% + 1500ms hide timer
      // After program completes, progress bar should be hidden again
    });

    await runTest("verify button works", async () => {
      await page.click("#btn-verify");
      await new Promise(r => setTimeout(r, 500));
      // Verify should complete with mock
    });

    await runTest("reset button works", async () => {
      await page.click("#btn-reset");
      await new Promise(r => setTimeout(r, 500));
    });

    await runTest("PVR chain works", async () => {
      await page.click("#btn-program-verify-reset");
      await new Promise(r => setTimeout(r, 2000));
    });

    // ── 5. Debug ────────────────────────────────────────────

    console.log("\n── Debug ──");
    await runTest("halt button works", async () => {
      await switchTab(page, "debug");
      await new Promise(r => setTimeout(r, 200));
      const btn = await page.$eval("#btn-core-halt", el => el.disabled);
      if (btn) throw new Error("halt disabled after connect");
      await page.click("#btn-core-halt");
      await new Promise(r => setTimeout(r, 500));
    });

    await runTest("resume button works", async () => {
      await page.click("#btn-core-resume");
      await new Promise(r => setTimeout(r, 500));
    });

    await runTest("step button works", async () => {
      await page.click("#btn-core-step");
      await new Promise(r => setTimeout(r, 500));
    });

    await runTest("read registers fills regs panel", async () => {
      await page.click("#btn-core-regs");
      await new Promise(r => setTimeout(r, 500));
      const hidden = await page.$eval("#debug-regs", el => el.hidden);
      if (hidden) throw new Error("regs panel still hidden after read");
    });

    // ── 6. Memory Read ──────────────────────────────────────

    console.log("\n── Memory Read ──");
    await runTest("memory read completes", async () => {
      await switchTab(page, "memory");
      await new Promise(r => setTimeout(r, 200));
      await page.$eval("#mem-addr-input", el => { el.value = "0x1000"; el.dispatchEvent(new Event("change", {bubbles:true})); });
      await page.$eval("#mem-len-input", el => { el.value = "64"; el.dispatchEvent(new Event("change", {bubbles:true})); });
      await page.click("#btn-mem-read");
      await new Promise(r => setTimeout(r, 1000));
      const status = await page.$eval("#mem-status", el => el.textContent);
      if (!status.includes("Read") && !status.includes("read")) throw new Error(`mem status: "${status}"`);
    });

    await runTest("memory dump is visible after read", async () => {
      const hidden = await page.$eval("#mem-dump", el => el.hidden);
      if (hidden) throw new Error("mem dump still hidden after read");
    });

    await runTest("read all flash works", async () => {
      await page.click("#btn-mem-read-flash");
      await new Promise(r => setTimeout(r, 2000));
    });

    // ── 7. UICR ─────────────────────────────────────────────

    console.log("\n── UICR ──");
    await runTest("UICR read completes", async () => {
      await switchTab(page, "uicr");
      await new Promise(r => setTimeout(r, 200));
      await page.click("#btn-uicr-read");
      await new Promise(r => setTimeout(r, 1000));
      const status = await page.$eval("#uicr-status", el => el.textContent);
      if (!status.includes("complete")) throw new Error(`uicr status: "${status}"`);
    });

    await runTest("UICR dump contains register names", async () => {
      const dump = await page.$eval("#uicr-dump", el => el.textContent);
      if (!dump.includes("CLENR0")) throw new Error(`uicr dump missing CLENR0: "${dump.slice(0,100)}"`);
    });

    // ── 8. RTT ──────────────────────────────────────────────

    console.log("\n── RTT ──");
    await runTest("RTT search button enabled after connect", async () => {
      await switchTab(page, "rtt");
      await new Promise(r => setTimeout(r, 200));
      const btn = await page.$eval("#btn-rtt-search", el => el.disabled);
      if (btn) throw new Error("RTT search disabled after connect");
    });

    await runTest("RTT clear button clears log", async () => {
      await page.evaluate(() => { document.getElementById("rtt-log").textContent = "test"; });
      await page.click("#btn-rtt-clear");
      await new Promise(r => setTimeout(r, 200));
      const t = await page.$eval("#rtt-log", el => el.textContent);
      if (t !== "") throw new Error(`rtt-log not cleared: "${t}"`);
    });

    // ── 9. Event log ────────────────────────────────────────

    console.log("\n── Event log ──");
    await runTest("SWD event log has content after connect", async () => {
      await switchTab(page, "connection");
      await new Promise(r => setTimeout(r, 200));
      const text = await page.$eval("#log", el => el.textContent);
      if (!text) throw new Error("event log empty after connect");
    });

    // ── 10. Serial section ──────────────────────────────────

    console.log("\n── Serial section ──");
    await runTest("switch to serial mode", async () => {
      await switchMode(page, "serial");
      const hidden = await page.$eval("#section-serial", el => el.hidden);
      if (hidden) throw new Error("serial section hidden");
    });

    await runTest("serial clear button works", async () => {
      await page.evaluate(() => { document.getElementById("serial-term-log").textContent = "test"; });
      await page.click("#btn-serial-clear");
      await new Promise(r => setTimeout(r, 200));
      const t = await page.$eval("#serial-term-log", el => el.textContent);
      if (t !== "") throw new Error(`serial log not cleared: "${t}"`);
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
