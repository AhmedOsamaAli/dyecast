import { chromium } from "playwright-core";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The YouTube thumbnail: the box promise next to the likely result, a question, and the YouCam credit.
// It is drawn from the same hair swatches and fonts as the film, offline, and saved at 2560 x 1440.
const root = fileURLToPath(new URL("..", import.meta.url));
const output = join(root, "out");
await mkdir(output, { recursive: true });

const embed = async (path, type) => `data:${type};base64,${(await readFile(path)).toString("base64")}`;
const font = (slug, style) => embed(join(root, "node_modules", "@fontsource-variable", slug, "files", `${slug}-latin-wght-${style}.woff2`), "font/woff2");
const swatch = (name) => embed(join(root, "public", "release", name), "image/png");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"Fraunces Variable";src:url(${await font("fraunces", "normal")}) format("woff2");font-style:normal;font-weight:100 900}
@font-face{font-family:"Fraunces Variable";src:url(${await font("fraunces", "italic")}) format("woff2");font-style:italic;font-weight:100 900}
@font-face{font-family:"Geist Variable";src:url(${await font("geist", "normal")}) format("woff2");font-weight:100 900}
*{box-sizing:border-box}
html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:#24130b}
.thumb{position:relative;width:1280px;height:720px;overflow:hidden;color:#fff;font-family:"Geist Variable",sans-serif}
.half{position:absolute;top:0;bottom:0;width:640px;overflow:hidden}
.half img{display:block;width:100%;height:100%;object-fit:cover;transform:scale(1.06)}
.left{left:0}.right{right:0}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(28,14,8,.62) 0%,rgba(28,14,8,0) 26%,rgba(28,14,8,0) 36%,rgba(28,14,8,.9) 100%)}
.divider{position:absolute;left:638px;top:0;bottom:0;width:4px;background:linear-gradient(180deg,#fff9ec 0%,#fff9ec 58%,rgba(255,249,236,0) 84%)}
.handle{position:absolute;left:640px;top:250px;width:92px;height:92px;margin-left:-46px;border-radius:50%;background:#fffaf2;color:#734432;display:grid;place-items:center;font-size:38px;font-weight:700;box-shadow:0 8px 30px rgba(0,0,0,.35)}
.tag{position:absolute;top:44px;padding:14px 22px;border-radius:12px;background:#fff9edee;color:#342317;font-size:30px;font-weight:700;letter-spacing:3px;text-transform:uppercase}
.tl{left:44px}.tr{right:44px}
h1{position:absolute;left:52px;bottom:58px;margin:0;font:700 112px/1.02 "Fraunces Variable",Georgia,serif;letter-spacing:-4px;text-shadow:0 6px 30px rgba(0,0,0,.5)}
h1 em{color:#f6c391;font-weight:600}
.brand{position:absolute;right:52px;bottom:58px;text-align:right}
.mark{font:600 78px/1 "Fraunces Variable",Georgia,serif;letter-spacing:-3px;text-shadow:0 4px 20px rgba(0,0,0,.45)}
.mark b{color:#f0b98c}
.by{display:inline-block;margin-top:16px;padding:11px 20px;border:2px solid #ffffffb0;border-radius:999px;background:#24130b99;font-size:21px;font-weight:600;letter-spacing:3px}
.by strong{color:#f6c391;font-weight:800}
</style></head><body><div class="thumb">
<div class="half left"><img src="${await swatch("swatch-box.png")}" alt=""></div>
<div class="half right"><img src="${await swatch("swatch-likely.png")}" alt=""></div>
<div class="shade"></div><div class="divider"></div><div class="handle">&lsaquo;&rsaquo;</div>
<div class="tag tl">Box promise</div><div class="tag tr">On your hair</div>
<h1>Will it work<br>on <em>your</em> hair?</h1>
<div class="brand"><div class="mark">dyecast<b>.</b></div><div class="by">POWERED BY <strong>YOUCAM API</strong></div></div>
</div></body></html>`;

const browser = await chromium.launch({
  ...(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {}),
});
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.route(/^https?:/, (route) => route.abort());
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, (image) => image.decode()));
  });
  const file = join(output, "DyeCast-thumbnail.jpg");
  await page.screenshot({ path: file, type: "jpeg", quality: 92 });
  console.log(`Thumbnail saved: ${file}`);
} finally {
  await browser.close();
}
