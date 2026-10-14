# Loopfield 0.3 alpha

Loopr is now Loopfield. This release shares one audio engine between Windows/Mac desktop packages and a lightweight browser app.

- Four tracks, live waveform envelopes, quantized recording/overdub, undo, count-in, MIDI synth and keyboard controls.
- Browser session import/export, WAV downloads, stored-take recovery and an offline cache.
- Windows portable build and experimental Intel/Apple Silicon Mac build targets.
- Optional support: https://buymeacoffee.com/davegooding

Audio stays on the device. Existing `.loopr` sessions can still be imported.

Browser disk recording uses OPFS when available. Memory fallback is limited to 64 MB of PCM; browser quotas and clearing site data can remove stored takes. Download recordings you want to retain. Browsers with transactional rather than synchronous OPFS writes may only retain completed takes after a crash.

Mac builds require macOS testing and production signing/notarization before they are described as ready for broad distribution. MIDI/output selection vary by browser. No native ASIO/WASAPI/Core Audio buffer controls or automatic measured latency calibration are included. Hardware latency and long-run drift must be tested with real equipment.
