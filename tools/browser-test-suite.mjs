#!/usr/bin/env node
// Browser-based test suite for web-swd-flasher.
// Keeps the browser open across tests so the USB authorization persists.
//
// Usage:
//   APP_URL=http://localhost:8000 node browser-test-suite.mjs
//
// Env:
//   APP_URL                — app URL (default http://localhost:8000)
//   PUPPETEER_CHROME       — path to Chrome binary (default: use Google Chrome)
//   BACKEND                — backend to select (default: cmsis-dap)
//   CONNECT_TIMEOUT_MS     — how long to wait for connect (default: 60000)
//   MANUAL_CHOOSER         — set to "1" if you will manually select the probe
//
// The harness opens one browser window, navigates to the app, and runs a
// sequence of tests.  If a test fails the suite continues and reports all
// failures at the end.

import puppeteer from "puppeteer";

const APP_URL = process.env.APP_URL || "http://localhost:8000";
const HEADLESS = process.env.HEADLESS === "1";
const CHROME_BIN = process.env.PUPPETEER_CHROME || undefined;
const BACKEND = process.env.BACKEND || "cmsis-dap";
const CONNECT_TIMEOUT_MS = parseInt(process.env.CONNECT_TIMEOUT_MS || "60000", 10);
const MANUAL_CHOOSER = process.env.MANUAL_CHOOSER === "1";

let passed = 0;
let failed = 0;
const failures = [];

function info(msg) {
  console.log(`  ${msg}`);
}

function step(msg) {
  console.log(`\n▶ ${msg}`);
}

function pass(name) {
  console.log(`  ✓ ${name}`);
  passed++;
}

function fail(name, err) {
  console.error(`  ✗ ${name}: ${err?.message ?? err}`);
  failures.push({ name, error: err?.message ?? String(err) });
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

async function waitForConnectedOrError(page, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snapshot = await page.evaluate(() => {
      const status = document.getElementById("status")?.textContent || "";
      const connected = document.getElementById("btn-disconnect")?.disabled === false;
      return { status, connected };
    });

    if (snapshot.connected) {
      return { ok: true, status: snapshot.status };
    }
    if (/failed/i.test(snapshot.status)) {
      return { ok: false, status: snapshot.status };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { ok: false, status: "timeout" };
}

async function readLogTail(page, n = 15) {
  return page.evaluate((count) => {
    const text = document.getElementById("log")?.textContent || "";
    const lines = text.trim().split("\n");
    return lines.slice(Math.max(0, lines.length - count));
  }, n);
}

async function launchBrowser() {
  const args = [
    "--enable-features=WebUSB,WebBluetooth,WebBluetoothNewPermissionsBackend",
    "--no-first-run",
    "--disable-default-apps",
    "--disable-popup-blocking"
  ];

  if (HEADLESS) {
    args.push("--headless=new");
  }

  return puppeteer.launch({
    headless: HEADLESS ? "new" : false,
    executablePath: CHROME_BIN,
    args
  });
}

async function main() {
  step("Launching browser");
  info(`URL: ${APP_URL}`);
  info(`Chrome: ${CHROME_BIN}`);
  info(`Backend: ${BACKEND}`);

  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    step("Opening application");
    await page.goto(APP_URL, { waitUntil: "networkidle0", timeout: 15000 });

    await page.select("#backend-select", BACKEND);

    const compatVisible = await page.evaluate(() => {
      const b = document.getElementById("compat-banner");
      return !!b && !b.hidden;
    });

    if (compatVisible) {
      const msg = await page.evaluate(() => document.getElementById("compat-msg")?.textContent || "");
      throw new Error(`Compatibility banner shown: ${msg}`);
    }

    step("Triggering USB chooser");
    const clickPromise = page.click("#btn-connect");

    if (BACKEND === "mock") {
      await clickPromise;
      info("Mock backend selected; chooser path skipped");
    } else if (HEADLESS) {
      throw new Error("HEADLESS=1 is not supported for non-mock backends (WebUSB chooser requires a display)");
    } else if (!MANUAL_CHOOSER) {
      try {
        const [prompt] = await Promise.all([
          page.waitForDevicePrompt({ timeout: 15000 }),
          clickPromise
        ]);
        info("Chooser opened (Puppeteer prompt API)");
        const devices = await prompt.devices();
        info(`Devices listed: ${devices.length}`);
        if (devices.length > 0) {
          await prompt.select(devices[0]);
          info(`Selected: ${devices[0].name || "(unnamed)"}`);
        } else {
          await prompt.cancel();
          info("No devices; cancelled chooser");
        }
      } catch {
        info("Device prompt API timed out; falling back to manual chooser polling.");
        info("If the chooser is open, please select the probe manually.");
      }
    } else {
      info("MANUAL_CHOOSER=1 — please select the probe in the browser chooser.");
    }

    const result = await waitForConnectedOrError(page, CONNECT_TIMEOUT_MS);
    if (!result.ok) {
      const tail = await readLogTail(page);
      if (tail.length) {
        info("Recent app logs:");
        for (const line of tail) {
          info(`  ${line}`);
        }
      }
      await page.screenshot({ path: "browser-test-suite-failure.png", fullPage: true });
      throw new Error(`Connect did not complete: ${result.status}`);
    }
    info(`Connected: ${result.status}`);

    // ── Test suite ──────────────────────────────────────────────

    await runTest("probe info is displayed", async () => {
      const infoText = await page.evaluate(() =>
        document.getElementById("target-info")?.textContent || ""
      );
      if (!infoText.includes("Backend:")) {
        throw new Error("Target info panel missing Backend line");
      }
    });

    await runTest("probe capabilities are displayed", async () => {
      const capsText = await page.evaluate(() =>
        document.getElementById("probe-caps")?.textContent || ""
      );
      if (!capsText.includes("Capabilities:")) {
        throw new Error("Probe capabilities panel missing");
      }
    });

    await runTest("target selector is populated", async () => {
      const optionCount = await page.evaluate(() =>
        document.getElementById("target-select")?.options?.length ?? 0
      );
      if (optionCount <= 1) {
        throw new Error(`Expected >1 options, got ${optionCount}`);
      }
    });

    await runTest("operation buttons are enabled after connect", async () => {
      const ids = ["btn-mem-read", "btn-rtt-search", "btn-check-protection"];
      for (const id of ids) {
        const disabled = await page.evaluate((elId) => document.getElementById(elId)?.disabled, id);
        if (disabled) {
          throw new Error(`#${id} is disabled after connect`);
        }
      }
    });

    await runTest("can read memory at address 0x0", async () => {
      await page.evaluate(() => {
        document.getElementById("mem-addr-input").value = "0x0";
        document.getElementById("mem-len-input").value = "64";
      });
      await page.click("#btn-mem-read");
      // Wait for the operation to complete
      await new Promise((r) => setTimeout(r, 3000));
      const status = await page.evaluate(() =>
        document.getElementById("mem-status")?.textContent || ""
      );
      if (!status.includes("Read")) {
        throw new Error(`Memory read failed or timed out: ${status}`);
      }
    });

    await runTest("can read UICR", async () => {
      await page.click("#btn-uicr-read");
      await new Promise((r) => setTimeout(r, 3000));
      const status = await page.evaluate(() =>
        document.getElementById("uicr-status")?.textContent || ""
      );
      if (!status.includes("complete")) {
        throw new Error(`UICR read failed: ${status}`);
      }
    });

    await runTest("can check protection status", async () => {
      await page.click("#btn-check-protection");
      await new Promise((r) => setTimeout(r, 3000));
      const status = await page.evaluate(() =>
        document.getElementById("recovery-status")?.textContent || ""
      );
      if (!status.includes("LOCKED") && !status.includes("Unlocked")) {
        throw new Error(`Protection check failed: ${status}`);
      }
    });

    // ── End of test suite ───────────────────────────────────────

    step("Test suite complete");
    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
      console.log("\nFailures:");
      for (const f of failures) {
        console.log(`  • ${f.name}: ${f.error}`);
      }
    }

    if (failed > 0) {
      await page.screenshot({ path: "browser-test-suite-failure.png", fullPage: true });
      process.exitCode = 1;
    }

    // Keep browser open so user can inspect state or run more tests
    info("Browser kept open. Press Ctrl+C to exit.");
    await new Promise(() => {}); // hang forever

  } catch (err) {
    console.error(`\n✗ Test suite failed: ${err.message}`);
    await page.screenshot({ path: "browser-test-suite-failure.png", fullPage: true });
    process.exit(1);
  } finally {
    // Only close if we haven't hung
    // await browser.close();
  }
}

main().catch((err) => {
  console.error(`\nFatal: ${err.message}`);
  process.exit(1);
});
