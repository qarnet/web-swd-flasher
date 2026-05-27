#!/usr/bin/env node

import puppeteer from "puppeteer";

const APP_URL = process.env.APP_URL || "http://localhost:8000";
const HEADLESS = process.env.HEADLESS === "1";
const CHROME_BIN = process.env.PUPPETEER_CHROME || undefined;
const BACKEND = process.env.BACKEND || "mock";
const CONNECT_TIMEOUT_MS = parseInt(process.env.CONNECT_TIMEOUT_MS || "45000", 10);
const AUTO_SELECT_USB_RULE = process.env.AUTO_SELECT_USB_RULE || "";

function info(msg) {
  console.log(`  ${msg}`);
}

function step(msg) {
  console.log(`\n▶ ${msg}`);
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

async function readLogTail(page) {
  return page.evaluate(() => {
    const text = document.getElementById("log")?.textContent || "";
    const lines = text.trim().split("\n");
    return lines.slice(Math.max(0, lines.length - 10));
  });
}

if (HEADLESS) {
  console.error("HEADLESS=1 is not supported for chooser smoke tests.");
  process.exit(2);
}

async function launchBrowser() {
  const args = [
    "--enable-features=WebUSB,WebBluetooth,WebBluetoothNewPermissionsBackend",
    "--no-first-run",
    "--disable-default-apps",
    "--disable-popup-blocking"
  ];

  if (AUTO_SELECT_USB_RULE) {
    args.push(`--auto-select-usb-devices-for-urls=${AUTO_SELECT_USB_RULE}`);
  }

  return puppeteer.launch({
    headless: false,
    executablePath: CHROME_BIN,
    args
  });
}

async function main() {
  step("Launching browser");
  info(`URL: ${APP_URL}`);
  info(`Chrome: ${CHROME_BIN || "puppeteer bundled"}`);
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
      step("Smoke test passed");
      return;
    }

    try {
      const [prompt] = await Promise.all([page.waitForDevicePrompt({ timeout: 15000 }), clickPromise]);
      info("Chooser opened successfully (Puppeteer prompt API)");
      const devices = await prompt.devices();
      info(`Chooser listed devices: ${devices.length}`);
      if (devices.length > 0) {
        await prompt.select(devices[0]);
        info(`Selected: ${devices[0].name || "(unnamed)"}`);
      } else {
        await prompt.cancel();
        info("No matching devices listed; cancelled chooser");
      }
    } catch {
      info("Device prompt API timed out; likely native WebUSB chooser is open without automation hook.");
      info("Proceeding with status polling for manual selection workflows.");
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
      await page.screenshot({ path: "browser-smoke-failure.png", fullPage: true });
      throw new Error(`Connect did not complete: ${result.status}`);
    }
    info(`Connect status: ${result.status}`);

    step("Smoke test passed");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`\n✗ Browser smoke failed: ${err.message}`);
  process.exit(1);
});
