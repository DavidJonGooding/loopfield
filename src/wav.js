(function (root) {
  function header(bytes, rate) {
    const b = new ArrayBuffer(44),
      v = new DataView(b);
    const text = (offset, value) => {
      for (let i = 0; i < value.length; i++)
        v.setUint8(offset + i, value.charCodeAt(i));
    };
    text(0, "RIFF");
    v.setUint32(4, bytes + 36, true);
    text(8, "WAVEfmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 2, true);
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * 4, true);
    v.setUint16(32, 4, true);
    v.setUint16(34, 16, true);
    text(36, "data");
    v.setUint32(40, bytes, true);
    return b;
  }
  function pcm(buffer) {
    const samples = new Float32Array(buffer),
      result = new ArrayBuffer(samples.length * 2),
      view = new DataView(result);
    for (let i = 0; i < samples.length; i++)
      view.setInt16(
        i * 2,
        Math.round(
          Math.max(
            -1,
            Math.min(1, Number.isFinite(samples[i]) ? samples[i] : 0),
          ) * 32767,
        ),
        true,
      );
    return result;
  }
  const api = { header, pcm };
  if (typeof module !== "undefined") module.exports = api;
  else root.LoopfieldWav = api;
})(globalThis);
