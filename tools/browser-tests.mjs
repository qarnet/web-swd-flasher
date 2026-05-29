#!/usr/bin/env node
// Tier-2 browser tests: headless Puppeteer + fake navigator.usb injection.
// Does NOT require real hardware. Requires the dev server to be running.
//
// Usage:
//   APP_URL=http://localhost:8000 node browser-tests.mjs
//
// Requirements:
//   - AF_UNIX sockets must be permitted (not available in some sandboxed environments)
//   - Set PUPPETEER_CHROME to a chromium/chrome binary if not using bundled one
//   - Start a dev server first: python3 -m http.server 8000 (from repo root)

import puppeteer from "puppeteer";

const APP_URL = process.env.APP_URL || "http://localhost:8000";
const CHROME_BIN = process.env.PUPPETEER_CHROME || undefined;

let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`  ok  ${name}`);
  passed++;
}

function fail(name, err) {
  console.error(`  FAIL ${name}: ${err?.message ?? err}`);
  failed++;
}

async function runTest(name, fn) {
  try {
    await fn();
    pass(name);
  } catch (err) {
    fail(name, err);
  }
}

// Inject fake navigator.usb so the app doesn't show the compat banner.
// The fake device will never connect — just enough to get past the guard.
const FAKE_USB_SCRIPT = `
(function() {
  if (navigator.usb) return; // already available (secure context in Chrome)
  navigator.usb = {
    getDevices: async () => [],
    requestDevice: async () => { throw new DOMException('No device selected', 'NotFoundError'); },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true
  };
})();
`;

async function openAppPage(browser) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(FAKE_USB_SCRIPT);
  // Suppress console noise from the page
  page.on("console", () => {});
  page.on("pageerror", (err) => { /* ignore */ });
  await page.goto(APP_URL, { waitUntil: "networkidle0", timeout: 20000 });
  return page;
}

async function main() {
  console.log(`\nBrowser tests — ${APP_URL}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_BIN,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ]
  });

  try {

    await runTest("app loads without JS errors", async () => {
      const page = await openAppPage(browser);
      const errors = [];
      page.on("pageerror", (err) => errors.push(err.message));
      // Give any deferred scripts a moment
      await new Promise((r) => setTimeout(r, 500));
      await page.close();
      if (errors.length > 0) throw new Error(`JS errors: ${errors.join("; ")}`);
    });

    await runTest("compat banner is hidden (navigator.usb injected)", async () => {
      const page = await openAppPage(browser);
      const hidden = await page.$eval("#compat-banner", (el) => el.hidden);
      await page.close();
      if (!hidden) throw new Error("compat banner visible despite fake usb");
    });

    await runTest("connect button is enabled on load", async () => {
      const page = await openAppPage(browser);
      const disabled = await page.$eval("#btn-connect", (el) => el.disabled);
      await page.close();
      if (disabled) throw new Error("btn-connect unexpectedly disabled");
    });

    await runTest("disconnect button is disabled on load", async () => {
      const page = await openAppPage(browser);
      const disabled = await page.$eval("#btn-disconnect", (el) => el.disabled);
      await page.close();
      if (!disabled) throw new Error("btn-disconnect should be disabled before connect");
    });

    await runTest("operation buttons disabled before connect", async () => {
      const page = await openAppPage(browser);
      const ids = ["btn-program", "btn-verify", "btn-reset", "btn-mem-read", "btn-rtt-search"];
      for (const id of ids) {
        const disabled = await page.$eval(`#${id}`, (el) => el.disabled);
        if (!disabled) throw new Error(`#${id} should be disabled before connect`);
      }
      await page.close();
    });

    await runTest("status shows Idle on load", async () => {
      const page = await openAppPage(browser);
      const text = await page.$eval("#status", (el) => el.textContent);
      await page.close();
      if (!text.includes("Idle") && !text.includes("Ready")) {
        throw new Error(`Unexpected status: "${text}"`);
      }
    });

    await runTest("image summary shows no image loaded", async () => {
      const page = await openAppPage(browser);
      const text = await page.$eval("#image-summary", (el) => el.textContent);
      await page.close();
      if (!text.toLowerCase().includes("no image")) {
        throw new Error(`Unexpected image summary: "${text}"`);
      }
    });

    await runTest("theme toggle switches dark/light mode", async () => {
      const page = await openAppPage(browser);
      // Start state
      const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      await page.click("#btn-theme");
      const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      await page.close();
      if (before === after) throw new Error("theme did not change after toggle");
    });

    await runTest("fetch hex URL failure shows error in log", async () => {
      const page = await openAppPage(browser);
      await page.$eval("#url-input", (el) => { el.value = "http://localhost:1/nonexistent.hex"; });
      const logBefore = await page.$eval("#log", (el) => el.textContent);
      await page.click("#btn-fetch-hex");
      // Wait briefly for the fetch to fail
      await new Promise((r) => setTimeout(r, 2000));
      const logAfter = await page.$eval("#log", (el) => el.textContent);
      await page.close();
      if (logAfter === logBefore) throw new Error("log did not update after fetch failure");
    });

    await runTest("settings persistence saves SWD clock to localStorage", async () => {
      const page = await openAppPage(browser);
      await page.select("#clock-select", "500000");
      const stored = await page.evaluate(() => localStorage.getItem("swd-clock-hz"));
      await page.close();
      if (stored !== "500000") throw new Error(`Expected "500000", got "${stored}"`);
    });

    await runTest("settings persistence restores SWD clock on reload", async () => {
      const page = await openAppPage(browser);
      // Set a non-default value
      await page.select("#clock-select", "2000000");
      await page.reload({ waitUntil: "networkidle0" });
      const value = await page.$eval("#clock-select", (el) => el.value);
      await page.close();
      if (value !== "2000000") throw new Error(`Expected "2000000", got "${value}"`);
    });

    await runTest("confirm checkbox gates program button", async () => {
      const page = await openAppPage(browser);
      // Program button should remain disabled even if somehow conditions were met
      // (they can't be without connect, but the checkbox should matter)
      const disabledBefore = await page.$eval("#btn-program", (el) => el.disabled);
      await page.click("#chk-confirm-program");
      // Still disabled (not connected, no image)
      const disabledAfter = await page.$eval("#btn-program", (el) => el.disabled);
      await page.close();
      if (!disabledBefore || !disabledAfter) {
        throw new Error("program button should remain disabled without connect + image");
      }
    });

    await runTest("swo panel hidden on load", async () => {
      const page = await openAppPage(browser);
      const hidden = await page.$eval("#swo-panel", (el) => el.hidden);
      await page.close();
      if (!hidden) throw new Error("SWO panel should be hidden before connect");
    });

    await runTest("event log collapsible on click", async () => {
      const page = await openAppPage(browser);
      const collapsedBefore = await page.$eval("#log", (el) => el.classList.contains("log-collapsed"));
      await page.click("#log");
      const collapsedAfter = await page.$eval("#log", (el) => el.classList.contains("log-collapsed"));
      await page.close();
      if (collapsedBefore === collapsedAfter) throw new Error("log did not toggle collapse class");
    });

    await runTest("RTT clear button clears rtt-log", async () => {
      const page = await openAppPage(browser);
      // Seed content
      await page.evaluate(() => { document.getElementById("rtt-log").textContent = "some log"; });
      await page.click("#btn-rtt-clear");
      const text = await page.$eval("#rtt-log", (el) => el.textContent);
      await page.close();
      if (text !== "") throw new Error(`rtt-log not cleared, still: "${text}"`);
    });

    await runTest("UART clear button clears uart-log", async () => {
      const page = await openAppPage(browser);
      await page.evaluate(() => { document.getElementById("uart-log").textContent = "uart output"; });
      await page.click("#btn-uart-clear");
      const text = await page.$eval("#uart-log", (el) => el.textContent);
      await page.close();
      if (text !== "") throw new Error(`uart-log not cleared, still: "${text}"`);
    });

  } finally {
    await browser.close();
  }

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`\nFatal: ${err.message}`);
  process.exit(1);
});
