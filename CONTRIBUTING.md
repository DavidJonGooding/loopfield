# Contributing to Loopfield

Use Node.js 24 and `npm ci`. Start the desktop with `npm start`; build/start the web app with `npm run build:web` and `npm run start:web`. Web audio needs HTTPS or localhost.

Run `npm test` for the deterministic audio/WAV tests. `npm run smoke` and `npm run smoke:web` exercise the desktop and browser file paths with synthetic audio, without opening the microphone. Hardware tests are a separate requirement: report OS, app/browser version, audio interface, sample rate, monitoring mode, and reproduction steps.

The shared engine is `src/engine.js` (AudioWorklet). `src/renderer.js` handles controls and waveforms. `src/platform.js` selects the Electron bridge or browser worker (`src/recording-worker.js`). Keep allocations, disk access, and UI work out of the steady audio render path. Preserve older `.loopr` sessions when changing the `.loopfield` format.

Discuss large features before submitting a PR. Include the behavior change, meaningful tests, and screenshots for interface changes. Do not upload personal recordings, credentials, signing certificates, generated profiles, or release executables to Git history. Contributions are under the MIT license.
