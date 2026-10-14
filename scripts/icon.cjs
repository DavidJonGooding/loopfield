// Small original loop-arrow app icon, generated without graphics dependencies.
const fs = require("node:fs");
const zlib = require("node:zlib");
const size = process.argv.includes("--mac") ? 1024 : 256,
  raw = Buffer.alloc((size * 4 + 1) * size);
function triangle(x, y) {
  return (
    y >= 93 &&
    y <= 133 &&
    x >= 185 - (y - 93) * 0.8 &&
    x <= 217 - (y - 93) * 0.8
  );
}
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const offset = y * (size * 4 + 1) + 1 + x * 4,
      dx = x / (size / 256) - 128,
      dy = y / (size / 256) - 128,
      r = Math.hypot(dx, dy),
      angle = Math.atan2(dy, dx);
    const arc = r > 65 && r < 86 && !(angle > -0.85 && angle < -0.12);
    const arrow = triangle(x / (size / 256), y / (size / 256));
    const c = arc || arrow ? [198, 244, 120] : [20, 24, 29];
    raw[offset] = c[0];
    raw[offset + 1] = c[1];
    raw[offset + 2] = c[2];
    const cornerX = Math.max(0, Math.abs(dx) - 95),
      cornerY = Math.max(0, Math.abs(dy) - 95);
    raw[offset + 3] = Math.hypot(cornerX, cornerY) > 32 ? 0 : 255;
  }
function crc(buffer) {
  let c = 0xffffffff;
  for (const b of buffer) {
    c ^= b;
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const tag = Buffer.from(name),
    b = Buffer.alloc(data.length + 12);
  b.writeUInt32BE(data.length);
  tag.copy(b, 4);
  data.copy(b, 8);
  b.writeUInt32BE(crc(Buffer.concat([tag, data])), data.length + 8);
  return b;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size);
ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);
if (size === 1024) {fs.writeFileSync("src/icon-mac.png",png);process.exit(0);}
fs.writeFileSync("src/icon.png", png);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
fs.writeFileSync("src/icon.ico", Buffer.concat([ico, png]));
