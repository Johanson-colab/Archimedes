const { spawn } = require("node:child_process");
const path = require("node:path");

const DEFAULT_TIMEOUT_MS = 15 * 60_000;

function abortError() {
  return Object.assign(new Error("Stopped by the user."), { name: "AbortError" });
}

// These are local SSH/tar children owned by this operation. Closing a local SSH
// connection does not guarantee termination of a detached job on the server.
function stopChild(child, { platform = process.platform, spawnImpl = spawn } = {}) {
  if (child.exitCode != null || child.signalCode != null) return Promise.resolve();
  const fallback = () => { try { child.kill("SIGKILL"); } catch { /* Already gone. */ } };
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) { fallback(); return Promise.resolve(); }
  if (platform !== "win32") {
    try { process.kill(-child.pid, "SIGKILL"); } catch { fallback(); }
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let helper;
    let timer;
    let done = false;
    const finish = (failed) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (failed) fallback();
      resolve();
    };
    try {
      helper = spawnImpl(path.win32.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe"),
        ["/PID", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
      helper.once("error", () => finish(true));
      helper.once("close", (code) => finish(code !== 0));
      timer = setTimeout(() => {
        try { helper.kill("SIGKILL"); } catch { /* Already gone. */ }
        finish(true);
      }, 2_000);
    } catch { finish(true); }
  });
}

/** A single SSH command, or a local tar -> SSH upload with one shared lifetime. */
function runSshTransport({ args, env = {}, stdin, copyFrom, onData, signal, timeoutMs = DEFAULT_TIMEOUT_MS, spawnImpl = spawn, platform = process.platform }) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const copying = copyFrom !== undefined;
    const children = [];
    const closed = new Map();
    const output = [];
    let bytes = 0;
    let settled = false;
    let timer;

    const finish = (value, error, stop = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      const complete = () => {
        if (stop) for (const child of children) {
          child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy();
        }
        if (error) reject(error);
        else resolve({ ...value, output: output.join(""), bytes });
      };
      if (stop) Promise.all(children.map((child) => stopChild(child, { platform, spawnImpl }))).then(complete, complete);
      else complete();
    };
    const onAbort = () => finish(null, abortError(), true);
    const fail = (label, error) => finish(null, new Error(`${label}: ${error?.message || error}`), true);
    const collect = (stream) => {
      stream.setEncoding("utf8");
      stream.on("data", (text) => {
        if (settled) return;
        output.push(text);
        try { onData?.(text); } catch (error) { fail("Output handler failed", error); }
      });
      stream.on("error", (error) => fail("Transport output failed", error));
    };
    const start = (command, argv, label, childEnv) => {
      const child = spawnImpl(command, argv, {
        shell: false, windowsHide: true, detached: platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"], env: childEnv,
      });
      children.push(child);
      collect(child.stderr);
      child.stdin.on("error", (error) => {
        // SSH commands may finish without consuming a supplied file. An upload
        // must fail instead: early EOF/EPIPE can mean an incomplete checkout.
        if (copying || !["EPIPE", "ERR_STREAM_DESTROYED"].includes(error.code)) fail(`${label} input failed`, error);
      });
      child.once("error", (error) => fail(`${label} could not start`, error));
      child.once("close", (code, processSignal) => {
        if (settled) return;
        closed.set(child, code);
        if (copying && code !== 0) {
          fail(label, `${output.join("").trim().slice(-1_000) || "Process failed"} (exit ${code ?? processSignal ?? "unknown"})`);
        } else if (closed.size === (copying ? 2 : 1)) {
          finish({ code, timedOut: false });
        }
      });
      return child;
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    const limit = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
    timer = setTimeout(() => {
      if (copying) finish(null, Object.assign(new Error("Checkout upload timed out."), { name: "TimeoutError" }), true);
      else finish({ code: null, timedOut: true, error: "SSH command timed out." }, null, true);
    }, limit);
    try {
      const pack = copying ? start("tar", ["-czf", "-", "-C", copyFrom, "."], "Local tar", process.env) : null;
      const ssh = start("ssh", args, "SSH", { ...process.env, ...env });
      collect(ssh.stdout);
      if (pack) {
        pack.stdin.end();
        pack.stdout.on("data", (chunk) => { bytes += chunk.length; });
        pack.stdout.on("error", (error) => fail("Local tar output failed", error));
        pack.stdout.pipe(ssh.stdin);
      } else if (stdin !== undefined) {
        ssh.stdin.end(String(stdin));
      } else {
        // An unattended SSH command must not wait forever for local keyboard input.
        ssh.stdin.end();
      }
      if (signal?.aborted) onAbort();
    } catch (error) { fail("Transport could not start", error); }
  });
}

module.exports = { runSshTransport, stopChild };
