const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

async function desktop() {
  const handlers = new Map(), events = new Map(), closed = [];
  let file = Buffer.alloc(0), position = 0, choice = 1;
  const disk = {
    openSync: () => 1,
    closeSync: (fd) => closed.push(fd),
  };
  // Explicit sequential-write cursor; positional header rewrites leave it alone.
  disk.writeSync = function (_fd, buffer, offset = 0, length = buffer.length, at) {
    const start = at ?? position;
    const next = Buffer.alloc(Math.max(file.length, start + length));
    file.copy(next); buffer.copy(next, start, offset, offset + length); file = next;
    if (at === undefined) position = start + length;
    return length;
  };
  const electron = {
    app: { whenReady: () => Promise.resolve(), on() {}, quit() {} },
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
    ipcMain: { handle: (name, fn) => handlers.set(name, fn), on: (name, fn) => handlers.set(name, fn) },
    dialog: { showSaveDialog: async () => ({ filePath: "test.wav", canceled: false }), showMessageBoxSync: () => choice },
    BrowserWindow: class {
      constructor() { this.webContents = { on() {}, setWindowOpenHandler() {}, send() {} }; }
      removeMenu() {} loadFile() {} on(name, fn) { events.set(name, fn); }
    },
  };
  vm.runInNewContext(fs.readFileSync("main.cjs", "utf8"), {
    require: (name) => name === "electron" ? electron : name === "node:fs" ? disk : path,
    __dirname: process.cwd(), Buffer,
  });
  await Promise.resolve();
  return { handlers, events, closed, data: () => file, choose: (value) => choice = value };
}

test("closing confirmation preserves a recording until the window actually closes", async () => {
  const d = await desktop();
  await d.handlers.get("record-start")({}, 48000);
  d.handlers.get("record-chunk")({}, new Float32Array([0.5, -0.5]).buffer);
  d.events.get("close")({ preventDefault() { throw Error("Unexpected canceled close"); } });
  assert.equal(d.closed.length, 0, "A later session dialog may still cancel the close");
  d.events.get("closed")();
  const wav = d.data();
  assert.equal(d.closed.length, 1);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
  assert.equal(wav.readUInt32LE(24), 48000);
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(40), 4);
  assert.equal(wav.readInt16LE(44), 16384);
  assert.equal(wav.readInt16LE(46), -16383);
});

test("Keep recording cancels window close without finalizing the WAV", async () => {
  const d = await desktop();
  await d.handlers.get("record-start")({}, 48000);
  d.choose(0); let canceled = false;
  d.events.get("close")({ preventDefault() { canceled = true; } });
  assert.equal(canceled, true); assert.equal(d.closed.length, 0);
  d.handlers.get("record-stop")(); assert.equal(d.closed.length, 1);
});
