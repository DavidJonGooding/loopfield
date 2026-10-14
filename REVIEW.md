# Loopr review — waveform release (0.2)

The current app is a useful four-track live looper: recording boundaries follow the audio clock, overdubs are reversible, and song recording and editable sessions are separate. The next improvements should make timing, performance control, and recovery more dependable before expanding the instrument library.

## Added in this release

- A minimal waveform envelope on every track, using its existing accent color. A thin playhead shows loop position; played sections brighten and muted tracks dim. Empty tracks show a quiet baseline.
- Waveforms build during recording and reflect overdub cancellation, undo/redo, clear, and session loading. The display combines the energy of both stereo channels; opposite left/right phase does not make stereo audio disappear. These are compact RMS amplitude envelopes, not sample-by-sample editing views.
- The engine maintains 128 energy bins incrementally while recording. Only changed summaries are sent to the UI; playback does not scan or copy full audio buffers for graphics. Drawing runs in the renderer.
- Input and output clip indications now retain short transients between display updates. Previously, the UI sampled only every sixteenth audio callback and could miss a brief peak.
- Browser previews now identify themselves and explain that the desktop app is required, instead of leaving an unwired Enable audio button.

## Features to prioritize

1. **Latency calibration and device profiles.** An impulse loopback test with measured delay and variation, saved compensation per device pair, and a native driver/buffer control path if the current host proves too slow on the user's hardware.
2. **MIDI footswitch mapping and a performance mode.** Learn a pedal/CC mapping for record, overdub, undo and scene changes. Offer large controls, visible count-in/record states, and protection against accidental clear.
3. **Scenes and different track lengths.** Capture a short drum pattern beneath a longer chord or vocal loop, then queue verse/chorus mute combinations at musical boundaries.
4. **Autosave and recording recovery.** Restore an interrupted session, recover a WAV after a crash, and make disk-write failure visible without ending the application unexpectedly.
5. **A small effects strip and stem export.** Start with per-track pan, filter, delay and reverb, plus separate WAV exports for finishing a song in a DAW. Add loop seam smoothing with an audible before/after check.

Small additions with high value: rename/color tracks, tap tempo before capture, a loop length/time readout, and audio import. Keep complex arrangement and plugin hosting behind optional panels so the live interface remains simple.

## Remaining engineering findings

- WAV finalization rewrites the header synchronously. `finish()` needs a `finally` close and error handling that remains safe if the disk fills; its error path currently calls the same finalizer that can throw. A close also lacks an explicit renderer capture flush, so the last partial chunk is best retained by using Finish recording before closing.
- Captured song chunks go through renderer/main messages without a bounded queue or disk-backlog indicator. Long sessions and deliberate slow/full-disk cases still need stress tests.
- Loop allocation, undo copies, and session restoration run in worklet command handlers. Moving those preparations outside the audio thread is a priority if hardware tests reveal glitches.
- Two input devices have independent clocks and a single global compensation setting. Long-run drift and per-input alignment are not managed yet.
- Rapid device switches can finish out of order because input routing has no request generation guard. MIDI hot reconnect also needs a more complete rebind path.

## Verification

The deterministic tests cover audio timing, capture, WAV encoding/close behavior, waveform stereo energy, destructive-interference overdubbing, undo, restoration, unchanged-data suppression, and transient meter retention. Electron smoke tests check actual waveform delivery/drawing, session loading, and the live layout; a separate preview check covers the missing desktop bridge. Hardware latency, audible loop seams, and long-run disk/device stress remain to be measured on real equipment.
