#!/usr/bin/env node

import puppeteer from "puppeteer";

const APP_URL = process.env.APP_URL || "http://localhost:8000";
const HEADLESS = process.env.HEADLESS === "1";
const CHROME_BIN = process.env.PUPPETEER_CHROME || undefined;

function info(msg) {
  console.log(`  ${msg}`);
}

function step(msg) {
  console.log(`\n▶ ${msg}`);
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

  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    step("Opening application");
    await page.goto(APP_URL, { waitUntil: "networkidle0", timeout: 15000 });

    const compatVisible = await page.evaluate(() => {
      const b = document.getElementById("compat-banner");
      return !!b && !b.hidden;
    });

    if (compatVisible) {
      const msg = await page.evaluate(() => document.getElementById("compat-msg")?.textContent || "");
      throw new Error(`Compatibility banner shown: ${msg}`);
    }

    step("Triggering USB chooser");
    const [prompt] = await Promise.all([
      page.waitForDevicePrompt({ timeout: 30000 }),
      page.click("#btn-connect")
    ]);

    info("Chooser opened successfully");
    const devices = await prompt.devices();
    info(`Chooser listed devices: ${devices.length}`);

    if (devices.length > 0) {
      await prompt.select(devices[0]);
      info(`Selected: ${devices[0].name || "(unnamed)"}`);
    } else {
      await prompt.cancel();
      info("No matching devices listed; cancelled chooser");
    }

    step("Smoke test passed");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`\n✗ Browser smoke failed: ${err.message}`);
  process.exit(1);
});
