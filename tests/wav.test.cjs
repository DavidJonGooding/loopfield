const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { header, pcm } = require("../src/wav.js");
test("browser encoder produces stereo PCM WAV headers and bounded sample values", () => {
  const data = pcm(new Float32Array([0.5, -0.5, 2, -2, NaN, 0]).buffer),
    h = new DataView(header(data.byteLength, 48000)),
    v = new DataView(data);
  assert.equal(h.getUint32(4, true), data.byteLength + 36);
  assert.equal(h.getUint32(40, true), 12);
  assert.equal(h.getUint16(22, true), 2);
  assert.equal(h.getUint32(24, true), 48000);
  assert.equal(v.getInt16(0, true), 16384);
  assert.equal(v.getInt16(2, true), -16383);
  assert.equal(v.getInt16(4, true), 32767);
  assert.equal(v.getInt16(6, true), -32767);
  assert.equal(v.getInt16(8, true), 0);
});
