import { chromium } from "playwright-core";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = join(root, "public", "footage");
const destination = join(root, "public", "release");
await mkdir(destination, { recursive: true });
for (const file of await readdir(source)) {
  if (/\.(png|jpg)$/.test(file)) await copyFile(join(source, file), join(destination, file));
}
const browser = await chromium.launch({
  ...(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {}),
});
const page = await browser.newPage();
await page.route(/^https?:/, (route) => route.abort());
const geistDirectory = join(root, "node_modules", "@fontsource-variable", "geist", "files");
const geistFile = "geist-latin-wght-normal.woff2";
if (!(await readdir(geistDirectory)).includes(geistFile)) throw new Error("Missing Geist font for the redaction note.");
await page.evaluate(async (encoded) => {
  const font = new FontFace("Geist Variable", Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)), { weight: "100 900" });
  document.fonts.add(await font.load());
}, (await readFile(join(geistDirectory, geistFile))).toString("base64"));
const edits = [];

async function raster(file, operation, output = file) {
  const bytes = await readFile(join(source, file));
  const result = await page.evaluate(async ({ encoded, operation, jpeg }) => {
    const data = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    const original = await createImageBitmap(new Blob([data]));
    const canvas = document.createElement("canvas");
    let crop = { x: 0, y: 0, width: original.width, height: original.height };
    if (operation.kind === "crop") {
      crop = {
        x: Math.round(operation.x * original.width), y: Math.round(operation.y * original.height),
        width: Math.round(operation.width * original.width), height: Math.round(operation.height * original.height),
      };
    }
    canvas.width = crop.width;
    canvas.height = crop.height;
    const context = canvas.getContext("2d");
    context.drawImage(original, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    if (operation.kind === "retail-mask") {
      // Redraws the first "On the shelf" card (measured on the 980 x 1720 capture) without any brand or shade names.
      context.fillStyle = "#fffdf9";
      context.fillRect(160, 406, 764, 220);
      context.beginPath();
      context.roundRect(167, 413, 750, 206, 28);
      context.fillStyle = "#fbf8f3";
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = "#e9e0d4";
      context.stroke();
      context.fillStyle = "#6c6359";
      context.font = '700 22px "Geist Variable"';
      context.letterSpacing = "3px";
      context.fillText("ON THE SHELF", 190, 455);
      context.letterSpacing = "0px";
      context.fillStyle = "#241e19";
      context.font = '600 29px "Geist Variable"';
      context.fillText("Real boxes at this level and tone", 190, 514);
      context.fillStyle = "#8b7b6a";
      context.font = '400 25px "Geist Variable"';
      context.fillText("Brand names hidden in this video", 190, 562);
    }
    let finalCanvas = canvas;
    if (operation.kind === "retail-mask") {
      finalCanvas = document.createElement("canvas");
      finalCanvas.width = canvas.width;
      finalCanvas.height = Math.round(canvas.height * 0.38);
      finalCanvas.getContext("2d").drawImage(canvas, 0, 0);
    }
    original.close();
    return {
      encoded: finalCanvas.toDataURL(jpeg ? "image/jpeg" : "image/png", 0.95).split(",")[1],
      width: finalCanvas.width, height: finalCanvas.height,
    };
  }, { encoded: bytes.toString("base64"), operation, jpeg: output.endsWith(".jpg") });
  await writeFile(join(destination, output), Buffer.from(result.encoded, "base64"));
  edits.push({ source: file, output, operation, width: result.width, height: result.height });
}

try {
  for (const file of ["photo-today.jpg", "photo-box.jpg", "photo-likely.jpg"]) {
    await raster(file, { kind: "crop", x: 0.22, y: 0.065, width: 0.49, height: 0.395 });
  }
  for (const file of ["swatch-today.png", "swatch-box.png", "swatch-likely.png"]) {
    await raster(file, { kind: "crop", x: 0, y: 0, width: 1, height: 0.83 });
  }
  for (const file of ["choose-cards.png", "choose-alternate.png"]) {
    await raster(file, { kind: "crop", x: 0, y: 0, width: 1, height: 0.56 });
  }
  await raster("choose-best.png", { kind: "crop", x: 0, y: 0, width: 1, height: 0.56 });
  await raster("products.png", { kind: "retail-mask" });
  // These crops are extracted from the real device-preview panel, not generated replacements.
  for (const [index, name] of ["today", "honey", "caramel", "copper"].entries()) {
    await raster("try-colors.png", {
      kind: "crop", x: 0.026 + index * 0.2395 + 0.23 * 0.18, y: 0.216,
      width: 0.23 * 0.6, height: 0.313,
    }, `device-${name}.jpg`);
  }
  // The first capture had the app's sticky header floating over the top 144 px; start below it.
  for (const output of ["profile.png", "photo-assist.png"]) {
    await raster("profile.png", { kind: "crop", x: 0, y: 144 / 1458, width: 1, height: 1314 / 1458 }, output);
  }
  await writeFile(join(destination, "edits.json"), JSON.stringify({
    note: "Editorial crops and explicit trademark redactions for competition footage only. App behavior and prediction pixels are unchanged.",
    edits,
  }, null, 2));
  console.log("Release footage prepared: portraits cropped; retail names explicitly redacted.");
} finally {
  await browser.close();
}
