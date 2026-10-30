import { copyFile, cp, mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vendor = join(root, "public", "vendor");
const packages = ["@mediapipe/tasks-vision", "tesseract.js", "tesseract.js-core"];

for (const name of packages) {
  const source = join(root, "node_modules", ...name.split("/"));
  const { version, license } = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  if (license !== "Apache-2.0") throw new Error(`Review the license before serving ${name}.`);
  const slug = name === "@mediapipe/tasks-vision" ? "mediapipe" : name;
  const target = join(vendor, `${slug}-${version}`);
  await mkdir(target, { recursive: true });

  if (name === "@mediapipe/tasks-vision") {
    await cp(join(source, "wasm"), join(target, "wasm"), { recursive: true });
    await copyFile(join(root, "node_modules", "tesseract.js-core", "LICENSE"), join(target, "LICENSE"));
  } else if (name === "tesseract.js") {
    await copyFile(join(source, "dist", "worker.min.js"), join(target, "worker.min.js"));
    await copyFile(join(source, "LICENSE.md"), join(target, "LICENSE"));
  } else {
    for (const file of await readdir(source)) {
      if (/^tesseract-core(?:-(?:relaxedsimd|simd))?-lstm\.wasm(?:\.js)?$/.test(file) || file === "LICENSE") {
        await copyFile(join(source, file), join(target, file));
      }
    }
  }
  console.log(`Self-hosted ${name}@${version}`);
}
