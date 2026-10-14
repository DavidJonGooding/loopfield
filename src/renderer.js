const $ = (id) => document.getElementById(id);
let context,
  node,
  inputGain,
  streams = [],
  sources = [],
  enabled = false,
  state = null,
  recording = false,
  recordingBusy = false,
  recordStart = 0,
  midiAccess,
  activeMidi = null,
  requestId = 0,
  dirty = false;
const requests = new Map(),
  colors = ["#c6f478", "#a6bdff", "#f6bb7e", "#d5a4ed"];
const notes = { z: 48, x: 50, v: 52, b: 55, n: 57, m: 60, ",": 62, ".": 64 };
const waveforms = Array.from({ length: 4 }, () => new Float32Array(128));
function message(text, error = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", error);
}
function send(m) {
  if (node) {
    if (m.type === "mix" && Number.isInteger(m.track)) dirty = true;
    node.port.postMessage(m);
  }
}
function action(track, type) {
  if (!enabled) return message("Enable audio first.");
  if (
    type === "clear" &&
    state?.tracks[track].hasAudio &&
    !confirm(`Clear track ${track + 1}?`)
  )
    return;
  send({ type, track });
  dirty = true;
}
for (let i = 0; i < 4; i++) {
  const el = document.createElement("article");
  el.className = "track panel";
  el.style.setProperty("--accent", colors[i]);
  el.innerHTML = `<div class="track-number">0${i + 1}</div><div><div class="track-top"><span class="track-name">${["Rhythm", "Bass", "Harmony", "Texture"][i]}</span><span class="track-state" id="state-${i}">Empty</span></div><div class="track-status" id="status-${i}">Ready for your first layer</div><label class="track-volume"><span>LEVEL</span><input aria-label="Track ${i + 1} volume" type="range" min="0" max="1.5" value="1" step="0.01"></label></div><div class="track-controls"><button class="arm" id="arm-${i}">● Record <kbd>${i + 1}</kbd></button><button id="mute-${i}">Mute</button><button id="undo-${i}">Undo</button><button id="clear-${i}">Clear</button></div><div class="track-progress" id="progress-${i}"></div>`;
  const canvas = document.createElement("canvas");
  canvas.className = "track-waveform";
  canvas.id = `waveform-${i}`;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `Track ${i + 1} waveform: no audio`);
  el.querySelector(".track-status").after(canvas);
  $("tracks").appendChild(el);
  $(`arm-${i}`).onclick = () => action(i, "arm");
  $(`clear-${i}`).onclick = () => action(i, "clear");
  $(`undo-${i}`).onclick = () => action(i, "undo");
  $(`mute-${i}`).onclick = () =>
    send({ type: "mix", track: i, mute: !state?.tracks[i].mute });
  el.querySelector("input").oninput = (e) =>
    send({ type: "mix", track: i, gain: +e.target.value });
}
function drawWaveform(i) {
  const canvas = $(`waveform-${i}`),
    ctx = canvas.getContext("2d");
  const width = canvas.clientWidth,
    height = canvas.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  if (!width || !height) return;
  if (
    canvas.width !== Math.round(width * dpr) ||
    canvas.height !== Math.round(height * dpr)
  ) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const track = state?.tracks[i],
    values = waveforms[i];
  const position = state?.position || 0;
  ctx.strokeStyle = "#343a43";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  for (let bar = 1; bar < +$("bars").value; bar++) {
    const x = (width * bar) / +$("bars").value;
    ctx.fillStyle = "#343a4366";
    ctx.fillRect(x, 2, 1, height - 4);
  }
  const hasSound = values.some((value) => value > 0.0001);
  if (!hasSound) {
    ctx.fillStyle = "#66717d";
    ctx.font = "9px 'Segoe UI', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(
      track?.pending ? "WAITING FOR THE DOWNBEAT" : "AWAITING SOUND",
      width,
      9,
    );
  } else {
    const step = width / values.length;
    ctx.fillStyle = track?.mute ? "#727d8b" : colors[i];
    for (let bin = 0; bin < values.length; bin++) {
      const amplitude = Math.min(1, Math.pow(values[bin], 0.65) * 1.7);
      if (amplitude < 0.002) continue;
      const h = Math.max(1, amplitude * (height - 6));
      ctx.globalAlpha = track?.mute
        ? 0.35
        : state?.running && bin / values.length < position
          ? 0.9
          : 0.48;
      ctx.fillRect(bin * step, (height - h) / 2, Math.max(1, step - 1.1), h);
    }
    ctx.globalAlpha = 1;
  }
  if (track?.hasAudio && state?.running && !state.countdown) {
    const x = Math.min(width - 1, position * width);
    ctx.fillStyle = `${colors[i]}18`;
    ctx.fillRect(Math.max(0, x - 4), 0, 9, height);
    ctx.fillStyle = track.mute ? "#a0a8b0" : "#f0f6e9";
    ctx.fillRect(x, 1, 1, height - 2);
  }
  canvas.setAttribute(
    "aria-label",
    `Track ${i + 1} audio waveform${track?.mute ? ", muted" : ""}${hasSound ? "" : ": no audio"}`,
  );
}
const waveformResize = new ResizeObserver(() =>
  waveforms.forEach((_wave, i) => drawWaveform(i)),
);
for (let i = 0; i < 4; i++) waveformResize.observe($(`waveform-${i}`));
async function listDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  for (const [id, kind] of [
    ["input", "audioinput"],
    ["input2", "audioinput"],
    ["output", "audiooutput"],
  ]) {
    const old = $(id).value;
    $(id).replaceChildren(
      new Option(id === "output" ? "System default" : "Default microphone", ""),
    );
    devices
      .filter((d) => d.kind === kind)
      .forEach((d, i) =>
        $(id).add(
          new Option(
            d.label || `${kind === "audioinput" ? "Input" : "Output"} ${i + 1}`,
            d.deviceId,
          ),
        ),
      );
    if ([...$(id).options].some((o) => o.value === old)) $(id).value = old;
  }
}
async function routeInputs() {
  const ids = [$("input").value];
  if ($("second").checked) {
    if ($("input2").value === $("input").value)
      return message("Choose two different audio inputs.", true);
    ids.push($("input2").value);
  }
  const newStreams = [],
    newSources = [];
  try {
    for (const id of ids) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: id ? { exact: id } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
        },
        video: false,
      });
      newStreams.push(stream);
      newSources.push(context.createMediaStreamSource(stream));
    }
    sources.forEach((s) => s.disconnect());
    streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streams = newStreams;
    sources = newSources;
    sources.forEach((s) => s.connect(inputGain));
    streams.forEach((s) =>
      s
        .getTracks()
        .forEach(
          (t) =>
            (t.onended = () =>
              message(
                "An input disconnected. Choose a working device and refresh.",
                true,
              )),
        ),
    );
    await listDevices();
    updateLatency();
    message(
      `Audio connected at ${context.sampleRate} Hz. Press 1–4 to capture a loop. Headphones recommended.`,
    );
  } catch (e) {
    newStreams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    throw e;
  }
}
function updateLatency() {
  const base = (context.baseLatency || 0) * 1000,
    out = (context.outputLatency || 0) * 1000;
  $("latency").replaceChildren(
    document.createTextNode(out ? out.toFixed(1) : "—"),
    Object.assign(document.createElement("small"), { textContent: " ms" }),
  );
  const settings = streams[0]?.getAudioTracks()[0]?.getSettings();
  $("latency-detail").textContent =
    `Output estimate ${out ? out.toFixed(1) + " ms" : "unavailable"} · graph ${base.toFixed(1)} ms · input report ${settings?.latency ? (settings.latency * 1000).toFixed(1) + " ms" : "unavailable"}. Not a round-trip measurement.`;
}
async function enable() {
  if (enabled) return;
  $("start").disabled = true;
  try {
    context = new AudioContext({ latencyHint: "interactive" });
    // Resume while the user's click still carries browser audio activation.
    const resumed = context.resume();
    await context.audioWorklet.addModule("engine.js");
    node = new AudioWorkletNode(context, "loop-engine", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    inputGain = context.createGain();
    inputGain.connect(node);
    node.connect(context.destination);
    node.port.onmessage = (e) => receive(e.data);
    await resumed;
    if ($("output").value && context.setSinkId)
      await context.setSinkId($("output").value);
    // Playback and the synth still work when no microphone permission is available.
    enabled = true;
    document.body.classList.add("audio-active");
    $("engine-state").textContent = "AUDIO ONLINE";
    $("engine-state").classList.add("active");
    $("start").textContent = "Audio enabled";
    $("play").disabled = false;
    $("record").disabled = false;
    settings(false);
    try {
      await routeInputs();
    } catch (e) {
      message(
        `Audio engine ready; input unavailable: ${e.message}. Choose another input.`,
        true,
      );
    }
    await listDevices();
    await setupMidi();
    mix();
    updateLatency();
  } catch (e) {
    enabled = false;
    node?.disconnect();
    await context?.close();
    context = null;
    node = null;
    message(`Could not enable audio: ${e.message}`, true);
    $("start").disabled = false;
  }
}
function receive(m) {
  if (m.type === "capture") {
    window.loopfieldPlatform.writeRecording(m.buffer);
    return;
  }
  if (m.type === "snapshot") {
    requests.get(m.id)?.(m);
    requests.delete(m.id);
    return;
  }
  if (m.type === "error") {
    message(m.message, true);
    return;
  }
  if (m.type !== "status") return;
  state = m;
  $("play").innerHTML = m.running
    ? "Ⅱ Pause <kbd>Space</kbd>"
    : "▶ Play <kbd>Space</kbd>";
  document
    .querySelectorAll(".beats i")
    .forEach((e, i) =>
      e.classList.toggle(
        "on",
        m.running && i === (m.countdown ? 4 - m.countdown : m.beat),
      ),
    );
  $("position").textContent = m.countdown
    ? `Count ${m.countdown}`
    : `${Math.floor(m.position * +$("bars").value) + 1} / ${$("bars").value}`;
  $("bpm").disabled = $("bars").disabled =
    m.running || m.tracks.some((t) => t.hasAudio);
  $("meter-fill").style.width = Math.min(100, m.peak * 100) + "%";
  $("peak").textContent =
    m.peak > 0 ? `${(20 * Math.log10(m.peak)).toFixed(1)} dB` : "−∞ dB";
  if (m.clip)
    message("Output clipped. Lower track levels or master volume.", true);
  m.tracks.forEach((t, i) => {
    if (t.waveform) waveforms[i] = t.waveform;
    const label = t.pending ? "Queued" : t.state;
    $(`state-${i}`).textContent = label;
    $(`status-${i}`).textContent = t.pending
      ? "Starts at the next loop boundary"
      : t.state === "recording"
        ? "Capturing one loop…"
        : t.state === "overdub"
          ? "Adding one layer…"
          : t.hasAudio
            ? "Loop ready · press again to overdub"
            : "Ready for your first layer";
    $(`arm-${i}`).innerHTML =
      `${t.pending ? "Cancel" : t.state === "recording" || t.state === "overdub" ? "● Capturing" : t.hasAudio ? "＋ Overdub" : "● Record"} <kbd>${i + 1}</kbd>`;
    $(`arm-${i}`).classList.toggle(
      "armed",
      !!t.pending || ["recording", "overdub"].includes(t.state),
    );
    $(`mute-${i}`).classList.toggle("muted", t.mute);
    $(`mute-${i}`).textContent = t.mute ? "Unmute" : "Mute";
    $(`progress-${i}`).style.width = t.hasAudio ? m.position * 100 + "%" : "0";
    drawWaveform(i);
  });
}
function mix() {
  send({
    type: "mix",
    monitor: $("monitor").checked,
    click: $("click").checked,
    countIn: $("count-in").checked,
    master: +$("master").value,
    compensation: +$("compensation").value,
  });
  if (inputGain) inputGain.gain.value = +$("input-gain").value;
}
function settings(markDirty = true) {
  const bpm = +$("bpm").value,
    bars = +$("bars").value;
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240)
    return message("Tempo must be between 40 and 240 BPM.", true);
  send({ type: "settings", bpm, bars });
  if (markDirty) dirty = true;
}
async function toggleRecording() {
  if (!enabled || recordingBusy) return;
  recordingBusy = true;
  $("record").disabled = true;
  try {
    if (recording) {
      await new Promise((resolve) => {
        const id = ++requestId;
        requests.set(id, resolve);
        send({ type: "capture", on: false });
        send({ type: "snapshot", id });
      });
      const path = await window.loopfieldPlatform.stopRecording();
      recording = false;
      message(`Performance saved: ${path}`);
    } else {
      const path = await window.loopfieldPlatform.startRecording(
        context.sampleRate,
      );
      if (path) {
        recording = true;
        recordStart = Date.now();
        send({ type: "capture", on: true });
        message(`Recording performance to ${path}`);
      }
    }
  } catch (e) {
    message(`Recording failed: ${e.message}`, true);
    recording = false;
    send({ type: "capture", on: false });
  } finally {
    recordingBusy = false;
    $("record").disabled = false;
    updateRecordButton();
  }
}
function updateRecordButton() {
  $("record").innerHTML = recording
    ? "■ Finish recording <kbd>R</kbd>"
    : "● Record song <kbd>R</kbd>";
  $("record").classList.toggle("recording", recording);
}
window.loopfieldPlatform?.onRecordingError((text) => {
  send({ type: "capture", on: false });
  recording = false;
  updateRecordButton();
  message(`Recording stopped: ${text}`, true);
});
setInterval(() => {
  if (recording) {
    const s = Math.floor((Date.now() - recordStart) / 1000);
    $("record-time").textContent = `${Math.floor(s / 60)
      .toString()
      .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  }
}, 250);
async function setupMidi() {
  if (!navigator.requestMIDIAccess) {
    message(
      "This browser does not support USB MIDI. Microphone, audio inputs and keyboard controls remain available.",
    );
    return;
  }
  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    function refresh() {
      const old = $("midi").value;
      $("midi").replaceChildren(new Option("None", ""));
      for (const d of midiAccess.inputs.values())
        $("midi").add(new Option(d.name, d.id));
      if (midiAccess.inputs.has(old)) $("midi").value = old;
      else {
        send({ type: "panic" });
        activeMidi = null;
      }
    }
    refresh();
    midiAccess.onstatechange = refresh;
  } catch (e) {
    message(
      `MIDI unavailable: ${e.message}. Audio inputs and keyboard controls remain available.`,
    );
  }
}
$("midi").onchange = () => {
  if (activeMidi) activeMidi.onmidimessage = null;
  send({ type: "panic" });
  activeMidi = midiAccess?.inputs.get($("midi").value);
  if (activeMidi)
    activeMidi.onmidimessage = (e) => {
      const [status, n, v] = e.data,
        command = status & 0xf0;
      if (command === 0x90 || command === 0x80)
        send({
          type: "note",
          note: n,
          velocity: v,
          on: command === 0x90 && v > 0,
        });
    };
};
function encode(audio) {
  if (!audio) return null;
  const bytes = new Uint8Array(audio.buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
function decode(s) {
  const raw = atob(s);
  if (raw.length % 8 !== 0) throw Error("Invalid stereo track data");
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}
async function saveSession() {
  if (!enabled) return message("Enable audio before saving.");
  if (
    state?.tracks.some(
      (t) => t.pending || ["recording", "overdub"].includes(t.state),
    )
  )
    return message("Wait until loop capture finishes before saving.");
  try {
    const snap = await new Promise((resolve) => {
      const id = ++requestId;
      requests.set(id, resolve);
      send({ type: "snapshot", id });
    });
    const data = JSON.stringify({
      version: 1,
      bpm: snap.bpm,
      bars: snap.bars,
      sampleRate: snap.sampleRate,
      tracks: snap.tracks.map((t) => ({ ...t, audio: encode(t.audio) })),
    });
    const p = await window.loopfieldPlatform.saveSession(data);
    if (p) {
      dirty = false;
      message(`Session saved: ${p}`);
    }
  } catch (e) {
    message(e.message, true);
  }
}
async function openSession() {
  if (recording)
    return message("Finish the song recording before opening a session.");
  if (
    dirty &&
    !confirm("Replace current loops? Save them first if you want to keep them.")
  )
    return;
  try {
    const data = await window.loopfieldPlatform.openSession();
    if (!data) return;
    const s = JSON.parse(data);
    if (
      s.version !== 1 ||
      !Number.isFinite(s.bpm) ||
      s.bpm < 40 ||
      s.bpm > 240 ||
      ![1, 2, 4, 8].includes(s.bars) ||
      !Number.isInteger(s.sampleRate) ||
      s.sampleRate < 8000 ||
      s.sampleRate > 192000 ||
      !Array.isArray(s.tracks) ||
      s.tracks.length !== 4
    )
      throw Error("Invalid Loopfield session");
    await enable();
    if (!enabled) return;
    const oldLength = Math.round(((s.sampleRate * 60) / s.bpm) * 4 * s.bars),
      newLength = Math.round(((context.sampleRate * 60) / s.bpm) * 4 * s.bars);
    const tracks = s.tracks.map((t) => {
      if (
        !Number.isFinite(t.gain) ||
        t.gain < 0 ||
        t.gain > 1.5 ||
        typeof t.mute !== "boolean"
      )
        throw Error("Invalid track settings");
      let audio = t.audio === null ? null : decode(t.audio);
      if (audio) {
        if (
          audio.length !== oldLength * 2 ||
          audio.some((x) => !Number.isFinite(x))
        )
          throw Error("Invalid track audio");
        if (s.sampleRate !== context.sampleRate) {
          const resampled = new Float32Array(newLength * 2);
          for (let i = 0; i < newLength; i++) {
            const p = (i * oldLength) / newLength,
              a = Math.floor(p),
              b = (a + 1) % oldLength,
              f = p - a;
            for (let c = 0; c < 2; c++)
              resampled[i * 2 + c] =
                audio[a * 2 + c] * (1 - f) + audio[b * 2 + c] * f;
          }
          audio = resampled;
        }
      }
      return { audio, gain: t.gain, mute: t.mute };
    });
    $("bpm").value = s.bpm;
    $("bars").value = s.bars;
    send({ type: "restore", bpm: s.bpm, bars: s.bars, tracks });
    document
      .querySelectorAll(".track-volume input")
      .forEach((e, i) => (e.value = tracks[i].gain));
    dirty = false;
    message("Session loaded. Press Space to play.");
  } catch (e) {
    message(`Could not open session: ${e.message}`, true);
  }
}
$("start").onclick = enable;
$("play").onclick = () => send({ type: "transport" });
$("bpm").onchange = $("bars").onchange = settings;
for (const id of [
  "monitor",
  "click",
  "count-in",
  "master",
  "compensation",
  "input-gain",
])
  $(id).oninput = () => {
    if (
      id === "compensation" &&
      (!Number.isFinite(+$(id).value) || +$(id).value < 0 || +$(id).value > 500)
    )
      return;
    mix();
  };
for (const id of ["input", "input2"])
  $(id).onchange = () =>
    enabled && routeInputs().catch((e) => message(e.message, true));
$("second").onchange = () => {
  $("second-row").hidden = !$("second").checked;
  if (enabled) routeInputs().catch((e) => message(e.message, true));
};
$("output").onchange = async () => {
  if (!enabled) return;
  try {
    if (!context.setSinkId)
      throw Error(
        "Output selection is unavailable; change the Windows default output.",
      );
    await context.setSinkId($("output").value);
    updateLatency();
    message("Output device changed.");
  } catch (e) {
    message(e.message, true);
  }
};
$("refresh").onclick = () =>
  listDevices().catch((e) => message(e.message, true));
if (navigator.mediaDevices)
  navigator.mediaDevices.ondevicechange = () => listDevices().catch(() => {});
$("record").onclick = toggleRecording;
$("save").onclick = saveSession;
$("open").onclick = openSession;
$("panic").onclick = () => send({ type: "panic" });
$("reset").onclick = () => {
  if (confirm("Clear all four loops?")) {
    send({ type: "reset" });
    settings();
    dirty = true;
  }
};
document.addEventListener("keydown", (e) => {
  if (
    e.repeat ||
    e.ctrlKey ||
    e.metaKey ||
    ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)
  )
    return;
  const key = e.key.toLowerCase();
  if (key === " ") {
    e.preventDefault();
    send({ type: "transport" });
  } else if (/^Digit[1-4]$/.test(e.code)) {
    e.preventDefault();
    const i = +e.code.slice(-1) - 1;
    if (e.shiftKey)
      send({ type: "mix", track: i, mute: !state?.tracks[i].mute });
    else action(i, e.altKey ? "undo" : "arm");
  } else if (key === "r") toggleRecording();
  else if (key === "c") {
    $("click").checked = !$("click").checked;
    mix();
  } else if (key === "h") {
    $("monitor").checked = !$("monitor").checked;
    mix();
  } else if (key === "escape") send({ type: "panic" });
  else if (notes[key])
    send({ type: "note", note: notes[key], velocity: 100, on: true });
});
document.addEventListener("keyup", (e) => {
  const n = notes[e.key.toLowerCase()];
  if (n) send({ type: "note", note: n, on: false });
});
window.addEventListener("blur", () => send({ type: "panic" }));
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "Current loops have unsaved changes.";
  }
});
if (!navigator.mediaDevices || !window.isSecureContext) {
  $("start").disabled = true;
  message(
    "Audio requires HTTPS or localhost. Use the hosted site or npm run start:web.",
    true,
  );
} else listDevices().catch((e) => message(e.message, true));
if (window.loopfieldPlatform.kind === "web") {
  document.body.classList.add("web-mode");
  $("record-description").textContent =
    "Record locally in your browser, then download a stereo WAV. Metronome excluded.";
  $("web-recording-tools").hidden = false;
  $("recover").onclick = async () => {
    if (recording) return message("Finish the current recording first.");
    try {
      message(await window.loopfieldPlatform.recoverRecording());
    } catch (e) {
      message(e.message, true);
    }
  };
  $("clear-takes").onclick = async () => {
    if (recording) return message("Finish the current recording first.");
    if (
      !confirm(
        "Clear this site's stored recording recovery files? Downloaded files are kept.",
      )
    )
      return;
    try {
      await window.loopfieldPlatform.clearRecordings();
      message("Browser recovery files cleared.");
    } catch (e) {
      message(e.message, true);
    }
  };
  if ("serviceWorker" in navigator && location.protocol !== "file:")
    navigator.serviceWorker.register("sw.js").catch(() => {});
}
