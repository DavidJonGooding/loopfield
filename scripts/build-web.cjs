const crypto = require("node:crypto");
const fs = require("node:fs"),
  path = require("node:path");
const output = path.resolve("dist/web");
fs.mkdirSync(output, { recursive: true });
for (const file of [
  "index.html",
  "style.css",
  "config.js",
  "platform.js",
  "renderer.js",
  "engine.js",
  "wav.js",
  "recording-worker.js",
  "icon.png",
  "manifest.webmanifest",
  "sw.js",
]) {
  fs.copyFileSync(path.join("src", file), path.join(output, file));
}
fs.writeFileSync(path.join(output, ".nojekyll"), "");
fs.copyFileSync("LICENSE", path.join(output, "LICENSE.txt"));
const digest = crypto.createHash("sha256");
for (const file of ["index.html", "style.css", "renderer.js", "engine.js", "platform.js", "recording-worker.js", "wav.js", "config.js"])
  digest.update(fs.readFileSync(path.join(output, file)));
const sw = fs.readFileSync(path.join(output, "sw.js"), "utf8").replace(/const CACHE\s*=\s*[^;]+;/, `const CACHE = "loopfield-${digest.digest("hex").slice(0,12)}";`);
fs.writeFileSync(path.join(output, "sw.js"), sw);
console.log(`Web app built: ${output}`);
