/* Also loaded by the Node tests through a mocked AudioWorkletProcessor. */
class LoopEngine extends AudioWorkletProcessor {
  constructor() {
    super();
    this.running = false;
    this.frame = 0;
    this.bpm = 100;
    this.bars = 2;
    this.length = 0;
    this.monitor = false;
    this.click = true;
    this.countIn = true;
    this.countdown = 0;
    this.master = 0.8;
    this.compensation = 0;
    this.capture = false;
    this.captureBuffer = new Float32Array(8192);
    this.captureOffset = 0;
    this.tick = 0;
    this.clickLeft = 0;
    this.peakHold = 0;
    this.clipHold = false;
    this.waveBins = 128;
    this.voices = new Map();
    this.tracks = Array.from({ length: 4 }, () => ({
      audio: null,
      undo: null,
      state: "empty",
      pending: null,
      gain: 1,
      mute: false,
      energy: new Float64Array(this.waveBins),
      undoEnergy: null,
      waveDirty: true,
    }));
    this.configure();
    this.port.onmessage = (e) => this.command(e.data);
  }
  configure() {
    this.beat = (sampleRate * 60) / this.bpm;
    this.length = Math.round(this.beat * 4 * this.bars);
  }
  command(m) {
    const t = this.tracks[m.track];
    switch (m.type) {
      case "transport":
        this.running = !this.running;
        if (this.running && this.frame === 0)
          this.clickLeft = Math.round(sampleRate * 0.025);
        break;
      case "settings":
        if (this.tracks.some((t) => t.audio) || this.running) {
          this.port.postMessage({
            type: "error",
            message: "Clear tracks and stop before changing tempo or length.",
          });
          break;
        }
        this.bpm = m.bpm;
        this.bars = m.bars;
        this.frame = 0;
        this.countdown = 0;
        this.configure();
        break;
      case "mix":
        if (t) {
          t.gain = m.gain ?? t.gain;
          t.mute = m.mute ?? t.mute;
        }
        this.master = m.master ?? this.master;
        this.monitor = m.monitor ?? this.monitor;
        this.click = m.click ?? this.click;
        this.countIn = m.countIn ?? this.countIn;
        this.compensation = Math.round(
          ((m.compensation ?? (this.compensation * 1000) / sampleRate) *
            sampleRate) /
            1000,
        );
        break;
      case "arm":
        if (!t) break;
        if (t.pending) {
          t.pending = null;
          if (t.state === "empty") t.audio = null;
          if (t.state === "empty") {
            t.energy.fill(0);
            t.waveDirty = true;
          }
          break;
        }
        if (t.state === "recording" || t.state === "overdub") {
          t.pending = "play";
          break;
        }
        if (!t.audio) {
          t.audio = new Float32Array(this.length * 2);
          t.energy.fill(0);
          t.waveDirty = true;
          t.pending = "recording";
        } else {
          t.undo = t.audio.slice();
          t.undoEnergy = t.energy.slice();
          t.pending = "overdub";
        }
        if (!this.running) {
          this.running = true;
          this.frame = 0;
          this.countdown = this.countIn ? Math.round(this.beat * 4) : 0;
        }
        break;
      case "clear":
        if (t) {
          t.audio = null;
          t.undo = null;
          t.state = "empty";
          t.pending = null;
          t.energy.fill(0);
          t.undoEnergy = null;
          t.waveDirty = true;
        }
        break;
      case "reset":
        this.frame = 0;
        this.countdown = 0;
        this.running = false;
        for (const t of this.tracks) {
          t.audio = null;
          t.undo = null;
          t.state = "empty";
          t.pending = null;
          t.energy.fill(0);
          t.undoEnergy = null;
          t.waveDirty = true;
        }
        break;
      case "undo":
        if (t?.undo) {
          const a = t.audio;
          t.audio = t.undo;
          t.undo = a;
          const energy = t.energy;
          t.energy = t.undoEnergy;
          t.undoEnergy = energy;
          t.waveDirty = true;
          t.state = "playing";
          t.pending = null;
        }
        break;
      case "note":
        if (m.on)
          this.voices.set(m.note, {
            phase: 0,
            freq: 440 * 2 ** ((m.note - 69) / 12),
            level: m.velocity / 127,
            release: false,
          });
        else if (this.voices.has(m.note))
          this.voices.get(m.note).release = true;
        break;
      case "panic":
        this.voices.clear();
        break;
      case "capture":
        if (!m.on && this.captureOffset) this.flushCapture();
        this.capture = m.on;
        break;
      case "snapshot":
        this.port.postMessage({
          type: "snapshot",
          id: m.id,
          bpm: this.bpm,
          bars: this.bars,
          sampleRate,
          tracks: this.tracks.map((t) => ({
            audio: t.audio,
            gain: t.gain,
            mute: t.mute,
          })),
        });
        break;
      case "restore":
        this.running = false;
        this.frame = 0;
        this.countdown = 0;
        this.bpm = m.bpm;
        this.bars = m.bars;
        this.configure();
        this.tracks = m.tracks.map((t) => ({
          audio: t.audio ? new Float32Array(t.audio) : null,
          undo: null,
          gain: t.gain,
          mute: t.mute,
          state: t.audio ? "playing" : "empty",
          pending: null,
          energy: new Float64Array(this.waveBins),
          undoEnergy: null,
          waveDirty: true,
        }));
        for (const t of this.tracks) {
          if (!t.audio) continue;
          for (let frame = 0; frame < this.length; frame++) {
            const bin = Math.floor((frame * this.waveBins) / this.length);
            t.energy[bin] +=
              t.audio[frame * 2] ** 2 + t.audio[frame * 2 + 1] ** 2;
          }
        }
        break;
    }
    this.status();
  }
  waveform(t) {
    if (!t.waveDirty) return undefined;
    t.waveDirty = false;
    const values = new Float32Array(this.waveBins);
    for (let bin = 0; bin < this.waveBins; bin++) {
      const frames =
        Math.ceil(((bin + 1) * this.length) / this.waveBins) -
        Math.ceil((bin * this.length) / this.waveBins);
      values[bin] = frames
        ? Math.sqrt(Math.max(0, t.energy[bin]) / (frames * 2))
        : 0;
    }
    return values;
  }
  status(peak = this.peakHold, clip = this.clipHold) {
    this.port.postMessage({
      type: "status",
      running: this.running,
      countdown: this.countdown ? Math.ceil(this.countdown / this.beat) : 0,
      position: this.frame / this.length,
      beat: Math.floor(this.frame / this.beat) % 4,
      peak,
      clip,
      tracks: this.tracks.map((t) => ({
        state: t.state,
        pending: t.pending,
        hasAudio: !!t.audio,
        mute: t.mute,
        waveform: this.waveform(t),
      })),
    });
    this.peakHold = 0;
    this.clipHold = false;
  }
  flushCapture() {
    const b = this.captureBuffer.slice(0, this.captureOffset);
    this.port.postMessage({ type: "capture", buffer: b.buffer }, [b.buffer]);
    this.captureOffset = 0;
  }
  process(inputs, outputs) {
    const out = outputs[0],
      input = inputs[0];
    let peak = 0,
      clip = false;
    for (let i = 0; i < out[0].length; i++) {
      if (this.running && !this.countdown && this.frame === 0)
        for (const t of this.tracks) {
          if (t.pending) {
            t.state = t.pending === "play" ? "playing" : t.pending;
            t.pending = null;
          } else if (t.state === "recording" || t.state === "overdub")
            t.state = "playing";
        }
      let synth = 0;
      for (const [n, v] of this.voices) {
        synth += Math.sin(v.phase) * v.level * 0.18;
        v.phase =
          (v.phase + (2 * Math.PI * v.freq) / sampleRate) % (2 * Math.PI);
        if (v.release) {
          v.level *= 0.998;
          if (v.level < 0.001) this.voices.delete(n);
        }
      }
      const l = (input[0]?.[i] || 0) + synth,
        r = (input[1]?.[i] ?? input[0]?.[i] ?? 0) + synth;
      peak = Math.max(peak, Math.abs(l), Math.abs(r));
      let left = this.monitor ? l : synth,
        right = this.monitor ? r : synth;
      if (this.running && this.countdown) {
        if (
          Math.floor(this.countdown / this.beat) !==
          Math.floor((this.countdown - 1) / this.beat)
        )
          this.clickLeft = Math.round(sampleRate * 0.025);
        this.countdown--;
      } else if (this.running) {
        for (const t of this.tracks) {
          if (!t.audio) continue;
          const p = this.frame * 2;
          if (t.state !== "recording" && !t.mute) {
            left += t.audio[p] * t.gain;
            right += t.audio[p + 1] * t.gain;
          }
          if (t.state === "recording" || t.state === "overdub") {
            const w =
              ((((this.frame - this.compensation) % this.length) +
                this.length) %
                this.length) *
              2;
            const oldL = t.audio[w],
              oldR = t.audio[w + 1];
            t.audio[w] += l;
            t.audio[w + 1] += r;
            const bin = Math.floor(((w / 2) * this.waveBins) / this.length);
            t.energy[bin] +=
              t.audio[w] ** 2 + t.audio[w + 1] ** 2 - oldL ** 2 - oldR ** 2;
            t.waveDirty = true;
          }
        }
        if (
          Math.floor(this.frame / this.beat) !==
          Math.floor((this.frame - 1) / this.beat)
        )
          this.clickLeft = Math.round(sampleRate * 0.025);
        this.frame = (this.frame + 1) % this.length;
      }
      let met = 0;
      if (this.running && this.click && this.clickLeft > 0) {
        met =
          (Math.sin((this.clickLeft * 2 * Math.PI * 1200) / sampleRate) *
            0.15 *
            this.clickLeft) /
          (sampleRate * 0.025);
        this.clickLeft--;
      }
      left *= this.master;
      right *= this.master;
      clip ||= Math.abs(left) > 1 || Math.abs(right) > 1;
      // Performance recording always includes dry input, independently of monitoring.
      if (this.capture) {
        this.captureBuffer[this.captureOffset++] = Math.max(
          -1,
          Math.min(1, left + (this.monitor ? 0 : l - synth) * this.master),
        );
        this.captureBuffer[this.captureOffset++] = Math.max(
          -1,
          Math.min(1, right + (this.monitor ? 0 : r - synth) * this.master),
        );
        if (this.captureOffset === this.captureBuffer.length)
          this.flushCapture();
      }
      out[0][i] = Math.max(-1, Math.min(1, left + met));
      out[1][i] = Math.max(-1, Math.min(1, right + met));
    }
    this.peakHold = Math.max(this.peakHold, peak);
    this.clipHold ||= clip;
    if (++this.tick % 16 === 0) this.status();
    return true;
  }
}
registerProcessor("loop-engine", LoopEngine);
