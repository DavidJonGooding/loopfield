importScripts("wav.js");
let take = null,
  chain = Promise.resolve();
const memoryLimit = 64 * 1024 * 1024,
  wavLimit = 0xffffffff - 36;
async function directory() {
  return (await navigator.storage.getDirectory()).getDirectoryHandle(
    "loopfield-recordings",
    { create: true },
  );
}
async function finish() {
  const t = take;
  if (!t) throw Error("No recording is active");
  take = null;
  if (t.sync) {
    try {
      t.sync.write(new Uint8Array(LoopfieldWav.header(t.bytes, t.rate)), {
        at: 0,
      });
      t.sync.flush();
    } finally {
      t.sync.close();
    }
    return { blob: await t.file.getFile(), name: t.name, persistent: true };
  }
  if (t.writer) {
    try {
      await t.writer.write({
        type: "write",
        position: 0,
        data: LoopfieldWav.header(t.bytes, t.rate),
      });
      await t.writer.close();
    } catch (error) {
      try {
        await t.writer.abort();
      } catch {}
      throw error;
    }
    return { blob: await t.file.getFile(), name: t.name, persistent: true };
  }
  return {
    blob: new Blob([LoopfieldWav.header(t.bytes, t.rate), ...t.parts], {
      type: "audio/wav",
    }),
    name: t.name,
    persistent: false,
  };
}
async function recover() {
  const dir = await directory(),
    files = [];
  for await (const [name, handle] of dir.entries())
    if (name.endsWith(".wav") && handle.kind === "file")
      files.push({ name, handle, file: await handle.getFile() });
  files.sort((a, b) => b.file.lastModified - a.file.lastModified);
  const last = files.find((f) => f.file.size >= 44);
  if (!last) throw Error("No stored take is available in this browser");
  const first = await last.file.slice(0, 44).arrayBuffer(),
    view = new DataView(first),
    rate = view.getUint32(24, true);
  if (view.getUint32(0, false) !== 0x52494646 || rate < 8000 || rate > 192000)
    throw Error("Stored take has an invalid WAV header");
  const bytes = Math.floor((last.file.size - 44) / 4) * 4;
  if (bytes > wavLimit) throw Error("Stored take exceeds the WAV size limit");
  const writer = await last.handle.createWritable({ keepExistingData: true });
  await writer.write({
    type: "write",
    position: 0,
    data: LoopfieldWav.header(bytes, rate),
  });
  await writer.close();
  return {
    blob: await last.handle.getFile(),
    name: last.name,
    persistent: true,
  };
}
async function run(m) {
  if (m.type === "start") {
    if (take) throw Error("A recording is already active");
    if (!Number.isInteger(m.rate) || m.rate < 8000 || m.rate > 192000)
      throw Error("Invalid sample rate");
    const name = `Loopfield-${new Date().toISOString().replace(/[:.]/g, "-")}.wav`;
    let dir;
    try {
      if (navigator.storage?.getDirectory) dir = await directory();
    } catch {}
    if (dir) {
      const file = await dir.getFileHandle(name, { create: true });
      if (typeof file.createSyncAccessHandle === "function") {
        const sync = await file.createSyncAccessHandle();
        sync.truncate(0);
        sync.write(new Uint8Array(LoopfieldWav.header(0, m.rate)), { at: 0 });
        sync.flush();
        take = { file, sync, name, rate: m.rate, bytes: 0, chunks: 0 };
      } else {
        const writer = await file.createWritable({ keepExistingData: false });
        await writer.write(LoopfieldWav.header(0, m.rate));
        take = { file, writer, name, rate: m.rate, bytes: 0 };
      }
    } else take = { parts: [], name, rate: m.rate, bytes: 0 };
    return { name, persistent: !!dir, memoryLimit };
  }
  if (m.type === "chunk") {
    if (!take) return;
    const b = LoopfieldWav.pcm(m.buffer);
    if (take.bytes + b.byteLength > wavLimit)
      throw Error("WAV file size limit reached");
    if (!take.writer && !take.sync && take.bytes + b.byteLength > memoryLimit)
      throw Error(
        "Browser memory recording limit reached. Finish or recover this take.",
      );
    if (take.sync) {
      const written = take.sync.write(new Uint8Array(b), {
        at: 44 + take.bytes,
      });
      if (written !== b.byteLength)
        throw Error("Incomplete recording write. Recover the take.");
      if (++take.chunks % 16 === 0) take.sync.flush();
    } else if (take.writer) await take.writer.write(b);
    else take.parts.push(b);
    take.bytes += b.byteLength;
    return;
  }
  if (m.type === "finish") return finish();
  if (m.type === "recover") {
    if (take) throw Error("Finish the active recording first");
    return recover();
  }
  if (m.type === "clear") {
    if (take) throw Error("Finish the active recording first");
    const dir = await directory();
    for await (const [name] of dir.entries()) await dir.removeEntry(name);
    return true;
  }
}
onmessage = ({ data: m }) => {
  chain = chain.then(async () => {
    try {
      const value = await run(m);
      postMessage({ id: m.id, value, ack: m.buffer?.byteLength || 0 });
    } catch (error) {
      postMessage({
        id: m.id,
        error: error.message,
        ack: m.buffer?.byteLength || 0,
      });
    }
  });
};
