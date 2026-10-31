import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const packageFile = require.resolve("@remotion/cli/package.json");
const cli = JSON.parse(await readFile(packageFile, "utf8"));
const entry = join(dirname(packageFile), typeof cli.bin === "string" ? cli.bin : cli.bin.remotion);
const short = process.argv.includes("--short");
const still = process.argv.indexOf("--still");
const output = still >= 0 ? join(root, "out", `review-${process.argv[still + 1]}.png`)
  : join(root, "out", short ? "DyeCast-short-draft.mp4" : "DyeCast-visual-draft.mp4");
await mkdir(join(root, "out"), { recursive: true });
const args = [
  entry, still >= 0 ? "still" : "render", join(root, "src", "index.ts"),
  short ? "DyeCastShort" : "DyeCastDraft", output,
  "--gl=angle", "--log=error",
  ...(still >= 0 ? [`--frame=${process.argv[still + 1]}`] : ["--codec=h264", "--crf=18", "--concurrency=2"]),
  ...(process.env.CHROME_EXE ? [`--browser-executable=${process.env.CHROME_EXE}`] : []),
];
console.log(`${still >= 0 ? "Review frame" : "Rendering"}: ${output}`);
const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit" });
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
  if (code === 0) console.log(`Saved ${output}`);
});
