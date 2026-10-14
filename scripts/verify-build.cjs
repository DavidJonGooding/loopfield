const fs = require("node:fs");
const assert = require("node:assert/strict");
const asar = require("@electron/asar");
const { output, archive, pkg } = require("./paths.cjs");
for (const file of [
  "main.cjs",
  "preload.cjs",
  "src/engine.js",
  "src/renderer.js",
  "src/index.html",
  "src/style.css",
  "src/platform.js",
  "src/config.js",
  "src/wav.js",
  "src/recording-worker.js",
]) {
  const packaged = asar.extractFile(archive, file);
  assert.ok(
    packaged.equals(fs.readFileSync(file)),
    `Packaged source differs: ${file}`,
  );
}
if (process.platform === "win32" && !process.argv.includes("--dir")) {
  const portable = fs.statSync(
    `${output}/${pkg.build.productName}-${pkg.version}-win-x64.exe`,
  );
  assert.ok(portable.size > 1000000, "Portable executable is incomplete");
}
console.log(
  "Packaged source matches final implementation; portable executable complete.",
);
