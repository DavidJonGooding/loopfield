// Shared UI/engine; only file persistence differs between desktop and browser.
(function () {
  if (window.desktop) {
    window.loopfieldPlatform = { ...window.desktop, kind: "desktop" };
    return;
  }
  let worker,
    next = 0,
    pendingBytes = 0,
    active = false,
    memoryRecovery = null;
  const requests = new Map(),
    errors = new Set();
  function report(message) {
    for (const fn of errors) fn(message);
  }
  function getWorker() {
    if (worker) return worker;
    worker = new Worker("recording-worker.js");
    worker.onmessage = ({ data: m }) => {
      pendingBytes = Math.max(0, pendingBytes - (m.ack || 0));
      const request = requests.get(m.id);
      requests.delete(m.id);
      if (request) {
        m.error ? request.reject(Error(m.error)) : request.resolve(m.value);
      } else if (m.error) {
        active = false;
        report(m.error);
      } else if (m.value?.blob) {
        // Preserve a late finish response so the user can still recover it.
        memoryRecovery = m.value;
      }
    };
    worker.onerror = (e) => {
      active = false;
      report(`Recording worker failed: ${e.message}`);
      for (const r of requests.values())
        r.reject(Error("Recording worker failed"));
      requests.clear();
      worker = null;
      pendingBytes = 0;
    };
    return worker;
  }
  function request(type, extra = {}) {
    return new Promise((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => {
        requests.delete(id);
        reject(
          Error(
            "Browser recording storage did not respond. Try Recover take, or use the desktop app.",
          ),
        );
      }, 20000);
      requests.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      getWorker().postMessage({ type, id, ...extra });
    });
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Give large downloads time to begin consuming the Blob.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return `${name} (download started)`;
  }
  window.loopfieldPlatform = {
    kind: "web",
    async startRecording(rate) {
      const result = await request("start", { rate });
      active = true;
      pendingBytes = 0;
      return `${result.name} · ${result.persistent ? "browser disk storage" : "memory mode, 64 MB maximum"}`;
    },
    writeRecording(buffer) {
      if (!active) return;
      if (pendingBytes + buffer.byteLength > 8 * 1024 * 1024) {
        active = false;
        report(
          "Recording storage cannot keep up. Recover the take before recording again.",
        );
        return;
      }
      pendingBytes += buffer.byteLength;
      getWorker().postMessage({ type: "chunk", buffer }, [buffer]);
    },
    async stopRecording() {
      active = false;
      const result = await request("finish");
      memoryRecovery = result;
      return download(result.blob, result.name);
    },
    async recoverRecording() {
      active = false;
      let result;
      // A stopped/error take may still have buffered data in its worker.
      try {
        result = await request("finish");
      } catch {
        try {
          result = await request("recover");
        } catch (error) {
          if (!memoryRecovery) throw error;
          result = memoryRecovery;
        }
      }
      memoryRecovery = result;
      return download(result.blob, result.name);
    },
    async clearRecordings() {
      await request("clear");
      memoryRecovery = null;
    },
    saveSession(data) {
      return Promise.resolve(
        download(
          new Blob([data], { type: "application/json" }),
          "Untitled.loopfield",
        ),
      );
    },
    openSession() {
      return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".loopfield,.loopr";
        input.hidden = true;
        document.body.appendChild(input);
        let done = false;
        const finish = (value) => {
          if (done) return;
          done = true;
          input.remove();
          window.removeEventListener("focus", focus);
          resolve(value);
        };
        const focus = () =>
          setTimeout(() => {
            if (!input.files.length) finish(null);
          }, 500);
        input.oncancel = () => finish(null);
        input.onchange = async () => {
          try {
            const file = input.files[0];
            if (!file) return finish(null);
            if (file.size > 300000000) throw Error("Session too large");
            finish(await file.text());
          } catch (e) {
            input.remove();
            reject(e);
          }
        };
        window.addEventListener("focus", focus);
        input.click();
      });
    },
    onRecordingError: (fn) => errors.add(fn),
  };
})();
