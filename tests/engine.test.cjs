const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
function engine() {
  let Engine;
  const messages = [];
  vm.runInNewContext(fs.readFileSync("src/engine.js", "utf8"), {
    sampleRate: 1000,
    AudioWorkletProcessor: class {
      constructor() {
        this.port = { postMessage: (m) => messages.push(m) };
      }
    },
    registerProcessor: (name, C) => (Engine = C),
    Float32Array,
    Map,
    Math,
  });
  return { e: new Engine(), messages };
}
function render(e, n, l = 0, r = l) {
  const output = [new Float32Array(n), new Float32Array(n)];
  e.process(
    [[new Float32Array(n).fill(l), new Float32Array(n).fill(r)]],
    [output],
  );
  return output;
}
function setup() {
  const { e, messages } = engine();
  e.command({ type: "settings", bpm: 240, bars: 1 });
  e.command({ type: "mix", click: false, master: 1, countIn: false });
  return { e, messages };
}
test("one stereo pass closes exactly at loop boundary and plays at audio-clock length", () => {
  const { e } = setup();
  e.command({ type: "arm", track: 0 });
  render(e, 1000, 0.25, 0.5);
  assert.equal(e.frame, 0);
  assert.equal(e.tracks[0].audio.length, 2000);
  const [l, r] = render(e, 128);
  assert.equal(e.tracks[0].state, "playing");
  assert.equal(l[0], 0.25);
  assert.equal(r[0], 0.5);
  assert.equal(e.frame, 128);
});
test("arming while playing waits for the next boundary; cancel leaves track empty", () => {
  const { e } = setup();
  e.command({ type: "transport" });
  render(e, 200);
  e.command({ type: "arm", track: 1 });
  render(e, 400, 0.8);
  assert.equal(e.tracks[1].audio[0], 0);
  e.command({ type: "arm", track: 1 });
  assert.equal(e.tracks[1].audio, null);
  e.command({ type: "arm", track: 1 });
  render(e, 400, 0.8);
  render(e, 100, 0.2);
  assert.ok(Math.abs(e.tracks[1].audio[0] - 0.2) < 1e-6);
});
test("overdub adds once; undo and redo swap the previous layer", () => {
  const { e } = setup();
  e.command({ type: "arm", track: 0 });
  render(e, 1000, 0.2);
  render(e, 1000);
  e.command({ type: "arm", track: 0 });
  const out = render(e, 1000, 0.3);
  assert.ok(Math.abs(out[0][0] - 0.2) < 1e-6);
  render(e, 1);
  assert.ok(Math.abs(e.tracks[0].audio[0] - 0.5) < 1e-6);
  e.command({ type: "undo", track: 0 });
  assert.ok(Math.abs(e.tracks[0].audio[0] - 0.2) < 1e-6);
  e.command({ type: "undo", track: 0 });
  assert.ok(Math.abs(e.tracks[0].audio[0] - 0.5) < 1e-6);
});
test("mute silences playback, stop preserves phase, reset clears audio", () => {
  const { e } = setup();
  e.command({ type: "arm", track: 0 });
  render(e, 1000, 0.4);
  e.command({ type: "mix", track: 0, mute: true });
  assert.equal(render(e, 128)[0][0], 0);
  e.command({ type: "transport" });
  const frame = e.frame;
  render(e, 128);
  assert.equal(e.frame, frame);
  e.command({ type: "reset" });
  assert.equal(e.frame, 0);
  assert.equal(e.tracks[0].audio, null);
});
test("compensation shifts captured impulse earlier with wrap around", () => {
  const { e } = setup();
  e.command({ type: "mix", compensation: 20 });
  e.command({ type: "arm", track: 0 });
  render(e, 1, 1);
  assert.equal(e.tracks[0].audio[980 * 2], 1);
  assert.equal(e.tracks[0].audio[0], 0);
});
test("WAV stream capture excludes click and flushes a partial final chunk", () => {
  const { e, messages } = setup();
  e.command({ type: "mix", click: true, monitor: true });
  e.command({ type: "transport" });
  e.command({ type: "capture", on: true });
  render(e, 100, 0.25);
  e.command({ type: "capture", on: false });
  const chunk = messages.find((m) => m.type === "capture");
  const audio = new Float32Array(chunk.buffer);
  assert.equal(audio.length, 200);
  assert.ok(audio.every((x) => x === 0.25));
});
test("tempo edits are refused for existing loops to protect buffer lengths", () => {
  const { e, messages } = setup();
  e.command({ type: "arm", track: 0 });
  e.command({ type: "settings", bpm: 120, bars: 4 });
  assert.equal(e.length, 1000);
  assert.ok(messages.some((m) => m.type === "error"));
});
test("MIDI note release decays, and panic removes active notes", () => {
  const { e } = setup();
  e.command({ type: "note", note: 60, velocity: 127, on: true });
  assert.ok(render(e, 100)[0].some((x) => x !== 0));
  e.command({ type: "note", note: 60, on: false });
  render(e, 5000);
  assert.equal(e.voices.size, 0);
  e.command({ type: "note", note: 64, velocity: 127, on: true });
  e.command({ type: "panic" });
  assert.equal(e.voices.size, 0);
});
test("one bar count-in does not write input into the armed loop", () => {
  const { e } = setup();
  e.command({ type: "mix", countIn: true });
  e.command({ type: "arm", track: 0 });
  render(e, 1000, 0.5);
  assert.equal(e.countdown, 0);
  assert.ok(e.tracks[0].audio.every((x) => x === 0));
  render(e, 1, 0.25);
  assert.equal(e.tracks[0].audio[0], 0.25);
});
test("song recording includes dry input even with live monitoring off", () => {
  const { e, messages } = setup();
  e.command({ type: "capture", on: true });
  const output = render(e, 100, 0.25);
  e.command({ type: "capture", on: false });
  assert.equal(output[0][0], 0);
  assert.equal(
    new Float32Array(messages.find((m) => m.type === "capture").buffer)[0],
    0.25,
  );
});
test("waveform summaries retain stereo energy and match overdub cancellation and undo", () => {
  const { e, messages } = setup();
  e.command({ type: "arm", track: 0 });
  render(e, 1000, 0.4, 0);
  e.status();
  let wave = messages.at(-1).tracks[0].waveform;
  assert.equal(wave.length, 128);
  assert.ok(wave.every((x) => Math.abs(x - Math.sqrt(0.08)) < 1e-6));
  render(e, 1000);
  e.command({ type: "arm", track: 0 });
  render(e, 1000, -0.4, 0);
  e.status();
  wave = messages.at(-1).tracks[0].waveform;
  assert.ok(
    wave.every((x) => x < 1e-6),
    "Opposite phase overdub should reduce the waveform",
  );
  e.command({ type: "undo", track: 0 });
  assert.ok(
    messages
      .at(-1)
      .tracks[0].waveform.every((x) => Math.abs(x - Math.sqrt(0.08)) < 1e-6),
  );
  e.command({ type: "clear", track: 0 });
  assert.ok(messages.at(-1).tracks[0].waveform.every((x) => x === 0));
});
test("session restoration rebuilds waveform and playback does not repeatedly send unchanged data", () => {
  const { e, messages } = setup();
  const audio = new Float32Array(2000);
  audio.fill(0.25, 1000);
  e.command({
    type: "restore",
    bpm: 240,
    bars: 1,
    tracks: Array.from({ length: 4 }, (_, i) => ({
      audio: i === 0 ? audio : null,
      gain: 1,
      mute: false,
    })),
  });
  const wave = messages.at(-1).tracks[0].waveform;
  assert.equal(wave[0], 0);
  assert.equal(wave[127], 0.25);
  e.status();
  assert.equal(messages.at(-1).tracks[0].waveform, undefined);
});
test("input peak and clipping indicators retain transients between UI updates", () => {
  const { e, messages } = setup();
  e.command({ type: "mix", monitor: true });
  render(e, 128, 2);
  for (let i = 0; i < 15; i++) render(e, 128);
  const status = messages.at(-1);
  assert.equal(status.peak, 2);
  assert.equal(status.clip, true);
});
