const { spawn } = require("node:child_process");
const path = require("node:path");
const { output, pkg } = require("./paths.cjs");
const executable = path.resolve(
  output,
  "win-unpacked",
  `${pkg.build.productName}.exe`,
);
const child = spawn(executable, [], {
  cwd: path.dirname(executable),
  detached: true,
  stdio: "ignore",
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.unref();
