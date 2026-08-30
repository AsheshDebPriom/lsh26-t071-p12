// Screenshots the running app so layout can actually be looked at, rather than
// reasoned about. Dev-only helper.
import puppeteer from "puppeteer-core";

const url = process.argv[2] ?? "http://localhost:3000";
const outDir = process.argv[3] ?? ".";
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: ["--no-sandbox"],
});

const shots = [
  { name: "phone-month", width: 390, height: 900, tab: "Month" },
  { name: "phone-forecast", width: 390, height: 900, tab: "Forecast" },
  { name: "phone-pockets", width: 390, height: 900, tab: "Pockets" },
  { name: "phone-log", width: 390, height: 900, tab: "Log" },
  { name: "desktop-month", width: 1100, height: 1000, tab: "Month" },
];

for (const s of shots) {
  const page = await browser.newPage();
  await page.setViewport({ width: s.width, height: s.height, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.waitForSelector('[role="tablist"]', { timeout: 15000 });
  const clicked = await page.evaluate((label) => {
    const btn = [...document.querySelectorAll('[role="tab"]')].find(
      (b) => b.textContent.trim() === label,
    );
    if (btn) { btn.click(); return true; }
    return false;
  }, s.tab);
  if (!clicked) console.log(`  (tab "${s.tab}" not found)`);
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `${outDir}/${s.name}.png`, fullPage: true });
  console.log(`${s.name}.png`);
  await page.close();
}

await browser.close();
