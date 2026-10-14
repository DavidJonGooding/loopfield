const { app, BrowserWindow, ipcMain, session } = require("electron");
app.commandLine.appendSwitch("no-proxy-server");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const web = process.argv.includes("--web"),
  packaged = process.argv.includes("--packaged");
const root = path.resolve(__dirname, ".."),
  folder = path.join(root, "artifacts"),
  profile = path.join(
    folder,
    `${web ? "web" : "desktop"}-profile-${process.pid}`,
  );
fs.mkdirSync(profile, { recursive: true });
app.setPath("userData", profile);
const appRoot = packaged
  ? path.resolve(root, require("../scripts/paths.cjs").archive)
  : root;
let saved,
  chunks = [],
  server;
const errors = [],
  downloads = [];
ipcMain.handle("session-save", (_e, data) => {
  saved = data;
  return "session.loopfield";
});
ipcMain.handle("session-open", () => saved);
ipcMain.handle("record-start", () => {
  chunks = [];
  return "take.wav";
});
ipcMain.on("record-chunk", (_e, data) => chunks.push(new Float32Array(data)));
ipcMain.handle("record-stop", () => "take.wav");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1360,
    height: 940,
    webPreferences: {
      preload: web ? undefined : path.join(appRoot, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      offscreen: true,
    },
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) =>
    cb(false),
  );
  win.webContents.on("console-message", (e) => {
    if (e.level === "error") errors.push(e.message);
  });
  win.webContents.on("did-fail-load", (_e, code, message) =>
    console.log(`Page load failed ${code}: ${message}`),
  );
  const run = (code) =>
    win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  try {
    if (web) {
      server = require("../scripts/dev-server.cjs").serve(
        path.join(root, "dist/web"),
        0,
      );
      if (!server.listening)
        await new Promise((r) => server.once("listening", r));
      const url = `http://127.0.0.1:${server.address().port}/`;
      const check = await fetch(url);
      assert.equal(check.status, 200, "Static web server responds");
      console.log("Web server ready");
      win.webContents.session.on("will-download", (_e, item) => {
        const file = path.join(folder, item.getFilename());
        item.setSavePath(file);
        downloads.push(
          new Promise((resolve, reject) =>
            item.once("done", (_e, status) =>
              status === "completed" ? resolve(file) : reject(Error(status)),
            ),
          ),
        );
      });
      await win.loadURL(url);
      console.log("Web page loaded");
    } else await win.loadFile(path.join(appRoot, "src/index.html"));
    const startup = run(
      `navigator.mediaDevices.getUserMedia=async()=>{throw Error('Microphone disabled in automated test')};navigator.mediaDevices.enumerateDevices=async()=>[];navigator.requestMIDIAccess=async()=>{throw Error('MIDI disabled in automated test')};$('bpm').value=240;$('bars').value=1;$('count-in').checked=false;await enable();`,
    );
    await delay(1500);
    console.log(
      await run(
        "return {context:context?.state,node:!!node,enabled,message:$('message').textContent}",
      ),
    );
    await startup;
    console.log("Audio startup complete");
    assert.equal(await run("return enabled"), true, "Audio enabled");
    assert.equal(
      await run(
        "return $('record').getBoundingClientRect().bottom<=innerHeight",
      ),
      true,
      "Recorder visible",
    );
    await run(
      "mix();send({type:'note',note:60,velocity:100,on:true});action(0,'arm');",
    );
    await delay(1400);
    await run("send({type:'note',note:60,on:false});");
    assert.equal(await run("return state.tracks[0].state"), "playing");
    assert.equal(await run("return waveforms[0].some(x=>x>0)"), true);
    await run(
      "document.dispatchEvent(new KeyboardEvent('keydown',{key:'!',code:'Digit1',shiftKey:true,bubbles:true}));",
    );
    await delay(100);
    assert.equal(await run("return state.tracks[0].mute"), true);
    console.log("Loop captured");
    await run("send({type:'mix',track:0,mute:false});await saveSession();");
    console.log("Session exported");
    if (web) {
      await delay(150);
      const files = await Promise.all(downloads);
      saved = fs.readFileSync(
        files.find((f) => f.endsWith(".loopfield")),
        "utf8",
      );
    }
    assert.ok(JSON.parse(saved).tracks[0].audio);
    await run("await toggleRecording();");
    console.log("Performance started");
    await delay(350);
    await run("await toggleRecording();");
    console.log("Performance finished");
    if (web) {
      await delay(150);
      const files = await Promise.all(downloads),
        wav = fs.readFileSync(files.find((f) => f.endsWith(".wav")));
      assert.equal(wav.toString("ascii", 0, 4), "RIFF");
      assert.equal(wav.readUInt32LE(40), wav.length - 44);
      assert.ok(wav.subarray(44).some((x) => x !== 0));
      await run(
        `window.testSession=${JSON.stringify(saved)};const original=HTMLInputElement.prototype.click;HTMLInputElement.prototype.click=function(){if(this.type==='file'){const d=new DataTransfer();d.items.add(new File([window.testSession],'test.loopfield'));this.files=d.files;this.dispatchEvent(new Event('change'));}else original.call(this);};`,
      );
      await run("await window.loopfieldPlatform.recoverRecording();");
      await delay(100);
      await Promise.all(downloads);
    } else assert.ok(chunks.some((c) => c.some((x) => x !== 0)));
    await run("dirty=false;await openSession();");
    await delay(100);
    assert.equal(await run("return state.running"), false);
    assert.equal(await run("return waveforms[0].some(x=>x>0)"), true);
    assert.equal(
      await run("return document.querySelector('.support-link').href"),
      "https://buymeacoffee.com/davegooding",
    );
    // Four real audio buffers provide a varied waveform fixture for visual QA.
    await run(
      `const bpm=100,bars=2,length=Math.round(context.sampleRate*60/bpm*4*bars);const tracks=Array.from({length:4},(_,track)=>{const audio=new Float32Array(length*2);for(let f=0;f<length;f++){const t=f/context.sampleRate,b=t*bpm/60,age=(b%(track===1?2:track===3?.5:1))*60/bpm;let v=track===0?Math.sin(t*2*Math.PI*65)*Math.exp(-age*20)*.65:track===1?Math.sin(t*2*Math.PI*82)*Math.exp(-age*3)*.3:track===2?(Math.sin(t*2*Math.PI*261.6)+Math.sin(t*2*Math.PI*329.6))*.12*(.35+.65*Math.sin(Math.PI*t/(length/context.sampleRate))**2):Math.sin(t*2*Math.PI*1600)*Math.exp(-age*70)*.25;audio[f*2]=audio[f*2+1]=v;}return {audio,gain:1,mute:false};});$('bpm').value=bpm;$('bars').value=bars;send({type:'restore',bpm,bars,tracks});send({type:'transport'});`,
    );
    await delay(200);
    fs.writeFileSync(
      path.join(folder, `${web ? "web" : "desktop"}-smoke.png`),
      (await win.webContents.capturePage()).toPNG(),
    );
    assert.deepEqual(errors, []);
    const result = {
      passed: true,
      mode: web ? "web" : "desktop",
      packaged,
      downloads: downloads.length,
      sampleRate: await run("return context.sampleRate"),
      rendererErrors: errors,
    };
    fs.writeFileSync(
      path.join(folder, `${web ? "web" : "desktop"}-result.json`),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
    await run("dirty=false;await context.close();");
    server?.close();
    app.exit(0);
  } catch (error) {
    console.error(error);
    console.error(errors);
    server?.close();
    app.exit(1);
  }
});
setTimeout(() => {
  console.error("Integration test timed out");
  app.exit(1);
}, 120000).unref();
