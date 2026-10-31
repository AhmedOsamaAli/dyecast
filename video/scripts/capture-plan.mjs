import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Re-captures only the "safety-first plan" panel for the film. The first capture was taken while the
// app's sticky header floated over it, and its wide shape did not fit the film frame.
const root = fileURLToPath(new URL("..", import.meta.url));
const output = join(root, "public", "footage");
const base = process.env.APP_URL ?? "https://dyecast.vercel.app";
const frameAspect = 980 / 654;
await mkdir(output, { recursive: true });
await mkdir(join(root, "out"), { recursive: true });

const browser = await chromium.launch({
  ...(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {}),
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
});
const context = await browser.newContext({ viewport: { width: 760, height: 1100 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.setDefaultTimeout(60000);
let accountCreated = false;
let failed = false;

async function go(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(1000);
    }
  }
}

try {
  await go(`${base}/register`);
  await page.getByLabel("Your name").fill("DyeCast Demo");
  await page.getByLabel("Email address").fill(`dyecast.qa+film-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(`film-${randomUUID()}`);
  await page.getByRole("button", { name: "Create your account" }).click();
  await page.waitForURL(/\/profile/, { waitUntil: "domcontentloaded", timeout: 150000 });
  accountCreated = true;

  // Same starting point as the main film capture (level 4.5), so the plan matches the rest of the story.
  await page.locator("#lengthsLevel").fill("4.5");
  await page.getByRole("button", { name: "Save my hair profile" }).click();
  await page.waitForURL(/\/check/, { waitUntil: "domcontentloaded", timeout: 150000 });

  await go(`${base}/check?mode=code`);
  await page.getByLabel("Shade code on the box").fill("9.1");
  await page.getByRole("button", { name: "See my full reality check" }).click();
  await page.waitForURL(/\/checks\//, { waitUntil: "domcontentloaded", timeout: 150000 });

  const plan = page.getByRole("heading", { name: "How to get the best result from this box" }).locator("..");
  await plan.waitFor({ state: "visible" });
  await page.evaluate(() => document.fonts.ready);
  await plan.evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 150));
  await page.waitForTimeout(800);
  const box = await plan.boundingBox();
  if (!box || box.width < 300) throw new Error("The plan panel was not found at a usable size.");
  const clip = { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, Math.round(box.width / frameAspect)) };
  await page.screenshot({ path: join(output, "plan.png"), clip });
  console.log(`Captured plan.png (${clip.width} x ${clip.height} CSS px)`);

  const manifestPath = join(output, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.captures["plan.png"] = {
    source: "live app", width: clip.width, height: clip.height, recapturedAt: new Date().toISOString(),
    note: "Re-captured in a narrow layout with the sticky header scrolled clear.",
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
} catch (error) {
  failed = true;
  console.error(error.message);
  await page.screenshot({ path: join(root, "out", "capture-error.png"), fullPage: true }).catch(() => {});
} finally {
  if (accountCreated) {
    try {
      await go(`${base}/settings`);
      await page.getByLabel(/type DELETE to confirm/).fill("DELETE");
      await page.getByRole("button", { name: "Delete account and all data" }).click();
      await page.waitForURL(/notice=account_deleted/, { waitUntil: "domcontentloaded", timeout: 150000 });
      console.log("Temporary film account deleted.");
    } catch (error) {
      failed = true;
      console.error("Temporary film-account cleanup failed:", error.message.split("\n")[0]);
    }
  }
  await browser.close();
  if (failed) process.exitCode = 1;
}
