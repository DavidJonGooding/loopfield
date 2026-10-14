const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  startRecording: (rate) => ipcRenderer.invoke("record-start", rate),
  writeRecording: (data) => ipcRenderer.send("record-chunk", data),
  stopRecording: () => ipcRenderer.invoke("record-stop"),
  saveSession: (data) => ipcRenderer.invoke("session-save", data),
  openSession: () => ipcRenderer.invoke("session-open"),
  onRecordingError: (fn) =>
    ipcRenderer.on("record-error", (_e, message) => fn(message)),
});
