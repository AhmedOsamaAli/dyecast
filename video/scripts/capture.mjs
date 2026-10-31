import { chromium } from "playwright-core";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = join(root, "public", "footage");
const base = process.env.APP_URL ?? "https://dyecast.vercel.app";
if (!process.env.PHOTO_PATH) throw new Error("Set PHOTO_PATH to the approved public-domain demo portrait.");
const portrait = await readFile(process.env.PHOTO_PATH);
const captures = {};
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {}),
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.setDefaultTimeout(60000);
let accountCreated = false;
let failed = false;

async function go(target, url) {
  for (let attempt = 0; ; attempt++) {
    try {
      await target.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await target.waitForTimeout(1000);
    }
  }
}

async function snapshot(file, locator, maxHeight) {
  await locator.waitFor({ state: "visible" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(650);
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box || box.width < 100 || box.height < 80) throw new Error(`Invalid capture bounds: ${file}`);
  if (maxHeight && box.height > maxHeight) {
    await page.screenshot({ path: join(output, file), clip: { ...box, height: maxHeight } });
  } else {
    await locator.screenshot({ path: join(output, file) });
  }
  captures[file] = { source: "live app", width: box.width, height: Math.min(box.height, maxHeight ?? box.height) };
  console.log(`Captured ${file}`);
}

async function seedSelfie(target) {
  await target.evaluate(async (bytes) => {
    const source = new Blob([Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))], { type: "image/jpeg" });
    const bitmap = await createImageBitmap(source);
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    const owner = document.querySelector('meta[name="dyecast-owner"]').content;
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("dyecast-private", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("files");
      request.onerror = () => reject(new Error("Could not copy the approved demo portrait to the phone preview."));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("files", "readwrite");
        transaction.objectStore("files").put({ blob, owner, savedAt: Date.now() }, `${owner}:selfie`);
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, portrait.toString("base64"));
}

try {
  await go(page, base);
  await snapshot("hero.png", page.locator(".hero"));
  await snapshot("hero-card.png", page.locator(".hero-card"));
  await go(page, `${base}/register`);
  await page.getByLabel("Your name").fill("DyeCast Demo");
  await page.getByLabel("Email address").fill(`dyecast.qa+film-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(`film-${randomUUID()}`);
  await page.getByRole("button", { name: "Create your account" }).click();
  await page.waitForURL(/\/profile/, { waitUntil: "domcontentloaded", timeout: 150000 });
  accountCreated = true;

  await page.getByLabel(/Upload.*Selfie/).setInputFiles(process.env.PHOTO_PATH);
  await page.locator(".lighting-check:not(.checking)").waitFor({ timeout: 120000 });
  await page.getByLabel(/Send a cleaned copy to YouCam/).check();
  await page.getByRole("button", { name: "Analyze my photo" }).click();
  await page.locator(".suggestion-hero").waitFor({ timeout: 180000 });
  const suggestion = await page.locator(".suggestion-hero").innerText();
  if (!/Level [45]/.test(suggestion)) throw new Error(`The demo starting color needs review: ${suggestion}`);
  await page.getByRole("button", { name: "Use these suggestions" }).click();
  await snapshot("profile.png", page.locator(".profile-panel"), 730);
  await snapshot("photo-assist.png", page.locator(".photo-assist"));
  await page.getByRole("button", { name: "Save my hair profile" }).click();
  await page.waitForURL(/\/check/, { waitUntil: "domcontentloaded", timeout: 150000 });

  await go(page, `${base}/choose`);
  await snapshot("choose-cards.png", page.locator(".pick-grid"));
  await snapshot("choose-best.png", page.locator(".pick-card").first());
  const bestFits = await page.locator(".pick-card h3").allInnerTexts();
  await page.getByText("A refresh", { exact: true }).click();
  await page.getByText("Low", { exact: true }).click();
  await snapshot("choose-alternate.png", page.locator(".pick-grid"));
  await page.getByText("Noticeable", { exact: true }).click();
  await page.getByText("Some", { exact: true }).click();
  await page.getByRole("button", { name: "Preview on my photo" }).click();
  await page.locator(".photo-row figure img").nth(3).waitFor({ timeout: 90000 });
  await snapshot("try-colors.png", page.locator(".compare-photos"));

  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    storageState: await context.storageState(),
  });
  try {
    const mobile = await phone.newPage();
    await go(mobile, `${base}/profile`);
    await seedSelfie(mobile);
    await go(mobile, `${base}/choose`);
    await mobile.getByRole("button", { name: "Preview on my photo" }).click();
    await mobile.locator(".photo-row figure img").nth(3).waitFor({ timeout: 90000 });
    await mobile.locator(".compare-photos").screenshot({ path: join(output, "try-colors-phone.png") });
    captures["try-colors-phone.png"] = { source: "live app", layout: "phone" };
  } finally {
    await phone.close();
  }

  await go(page, `${base}/check?mode=code`);
  await page.getByLabel("Shade code on the box").fill("9.1");
  await page.getByRole("button", { name: "See my full reality check" }).click();
  await page.waitForURL(/\/checks\//, { waitUntil: "domcontentloaded", timeout: 150000 });
  await snapshot("result.png", page.locator(".result-hero"));
  const swatches = page.locator(".comparison-grid .hair-swatch");
  for (const [index, name] of ["today", "box", "likely"].entries()) {
    await snapshot(`swatch-${name}.png`, swatches.nth(index));
  }
  await snapshot("why.png", page.locator(".result-columns > section.panel"));
  await snapshot("products.png", page.locator(".result-columns aside > .panel").last());
  await snapshot("plan.png", page.getByRole("heading", { name: "How to get the best result from this box" }).locator(".."), 740);

  await page.locator("#see-it-on-you input[type=checkbox]").check();
  await page.getByRole("button", { name: /Render with YouCam/ }).click();
  await page.locator("#see-it-on-you .compare").waitFor({ timeout: 180000 });
  await snapshot("photo-comparison.png", page.locator("#see-it-on-you"));
  const rendered = await page.locator("#see-it-on-you .compare img").evaluateAll((images) => images.map((image) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return { kind: image.alt === "Your photo with the likely result" ? "likely" : "box", bytes: canvas.toDataURL("image/jpeg", 0.94).split(",")[1] };
  }));
  if (rendered.length !== 2 || new Set(rendered.map((r) => r.kind)).size !== 2) {
    throw new Error("Both genuine YouCam preview images must be identified by their labels.");
  }
  for (const render of rendered) await writeFile(join(output, `photo-${render.kind}.jpg`), Buffer.from(render.bytes, "base64"));
  await copyFile(process.env.PHOTO_PATH, join(output, "photo-today.jpg"));

  await writeFile(join(output, "manifest.json"), JSON.stringify({
    capturedAt: new Date().toISOString(), app: base, source: "Real live DyeCast UI; no mock app screens",
    portrait: {
      name: "Loral O'Hara official portrait", author: "NASA / Bill Stafford", license: "Public domain",
      source: "https://commons.wikimedia.org/wiki/File:Loral_O%27Hara_official_portrait.jpg",
      note: "Illustrative try-on. No endorsement by NASA or the pictured person.",
    },
    startingPoint: suggestion, bestFits, boxChecked: "9.1", captures,
  }, null, 2));
  console.log("All live captures and genuine YouCam renders saved.");
} catch (error) {
  failed = true;
  console.error(error.message);
  await page.screenshot({ path: join(root, "out", "capture-error.png"), fullPage: true }).catch(() => {});
} finally {
  if (accountCreated) {
    try {
      await go(page, `${base}/settings`);
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
