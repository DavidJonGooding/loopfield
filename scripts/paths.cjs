const path = require("node:path"),
  pkg = require("../package.json");
const output = pkg.build.directories.output.replace("${version}", pkg.version);
const archive =
  process.platform === "darwin"
    ? path.join(
        output,
        process.arch === "arm64" ? "mac-arm64" : "mac",
        `${pkg.build.productName}.app/Contents/Resources/app.asar`,
      )
    : path.join(output, "win-unpacked/resources/app.asar");
module.exports = { pkg, output, archive };
