const { app, BrowserWindow, ipcMain, dialog, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
let win, recording;
function header(bytes, rate) {
  const b = Buffer.alloc(44);
  b.write("RIFF");
  b.writeUInt32LE(bytes + 36, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 4, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(bytes, 40);
  return b;
}
function finish() {
  if (!recording) return;
  fs.writeSync(recording.fd, header(recording.bytes, recording.rate), 0, 44, 0);
  fs.closeSync(recording.fd);
  const p = recording.path;
  recording = null;
  return p;
}
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (wc, permission, callback) =>
      callback(
        wc === win?.webContents && ["media", "midi"].includes(permission),
      ),
  );
  session.defaultSession.setPermissionCheckHandler(
    (wc, permission) =>
      wc === win?.webContents && ["media", "midi"].includes(permission),
  );
  win = new BrowserWindow({
    width: 1360,
    height: 940,
    minWidth: 1000,
    minHeight: 740,
    icon: path.join(__dirname, "src/icon.png"),
    backgroundColor: "#101216",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.removeMenu();
  win.loadFile("src/index.html");
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({url}) => {
    if(["https://buymeacoffee.com/davegooding","https://github.com/DavidJonGooding/loopfield","https://github.com/DavidJonGooding/loopfield/releases"].includes(url))shell.openExternal(url);
    return {action:"deny"};
  });
  win.webContents.on("will-prevent-unload", (e) => {
    if (
      dialog.showMessageBoxSync(win, {
        type: "question",
        buttons: ["Keep working", "Discard loops and close"],
        defaultId: 0,
        message: "There are unsaved loops. Close without saving the session?",
      }) === 1
    )
      e.preventDefault();
  });
  win.webContents.on("render-process-gone", () => finish());
  win.on("close", (e) => {
    if (
      recording &&
      dialog.showMessageBoxSync(win, {
        type: "question",
        buttons: ["Keep recording", "Finish and close"],
        defaultId: 0,
        message: "Finish the current song recording and close?",
      }) === 0
    )
      e.preventDefault();
  });
  // Finalize only after the window actually closes: an unsaved-session dialog
  // can still cancel a close after the recording confirmation has been shown.
  win.on("closed", () => finish());
});
ipcMain.handle("record-start", async (e, rate) => {
  if (recording) throw Error("Already recording");
  if (!Number.isInteger(rate) || rate < 8000 || rate > 192000)
    throw Error("Invalid sample rate");
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: "Record your performance",
    defaultPath: "Loopfield performance.wav",
    filters: [{ name: "WAV audio", extensions: ["wav"] }],
  });
  if (canceled) return null;
  const fd = fs.openSync(filePath, "w");
  fs.writeSync(fd, header(0, rate));
  recording = { fd, path: filePath, rate, bytes: 0 };
  return filePath;
});
ipcMain.on("record-chunk", (e, data) => {
  if (!recording) return;
  try {
    const samples = new Float32Array(data);
    const b = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++)
      b.writeInt16LE(
        Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767),
        i * 2,
      );
    if (recording.bytes + b.length > 0xfffffff0 - 36)
      throw Error("WAV size limit reached");
    fs.writeSync(recording.fd, b);
    recording.bytes += b.length;
  } catch (err) {
    finish();
    win.webContents.send("record-error", err.message);
  }
});
ipcMain.handle("record-stop", () => finish());
ipcMain.handle("session-save", async (e, data) => {
  if (typeof data !== "string" || data.length > 300000000)
    throw Error("Session too large");
  const r = await dialog.showSaveDialog(win, {
    defaultPath: "Untitled.loopfield",
    filters: [{ name: "Loopfield session", extensions: ["loopfield", "loopr"] }],
  });
  if (r.canceled) return null;
  fs.writeFileSync(r.filePath, data);
  return r.filePath;
});
ipcMain.handle("session-open", async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [{ name: "Loopfield session", extensions: ["loopfield", "loopr"] }],
  });
  if (r.canceled) return null;
  if (fs.statSync(r.filePaths[0]).size > 300000000)
    throw Error("Session too large");
  return fs.readFileSync(r.filePaths[0], "utf8");
});
app.on("window-all-closed", () => app.quit());
