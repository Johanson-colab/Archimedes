const { spawn } = require("node:child_process");
const { StringDecoder } = require("node:string_decoder");

const CAPTURE_CHARS = 64_000;

function terminateProcess(child, signal = "SIGTERM") {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    killer.on("error", () => { try { child.kill(); } catch {} }); killer.unref();
  } else {
    try { process.kill(-child.pid, signal); }
    catch { try { child.kill(signal); } catch {} }
  }
}

/** Capture a bounded tail; callers needing complete machine data must check the flag. */
function runProcess(command, args, { cwd, env, onData, signal, timeoutMs, stdin, stdinStream, captureChars = CAPTURE_CHARS, separateOutput = false } = {}) {
  if (signal?.aborted) return Promise.resolve({ exitCode: null, output: "", outputBytes: 0, outputTruncated: false, aborted: true, timedOut: false, error: "The operation was stopped before starting." });
  return new Promise(resolve => {
    let child, output = "", stdoutText = "", stderrText = "", outputBytes = 0, newlineCount = 0, lastCharacter = "", timedOut = false, aborted = false, error, timer, killTimer;
    const stdout = new StringDecoder("utf8"), stderr = new StringDecoder("utf8");
    const stop = () => {
      terminateProcess(child);
      if (!killTimer) { killTimer = setTimeout(() => terminateProcess(child, "SIGKILL"), 500); killTimer.unref(); }
    };
    const append = (chunk, decoder) => {
      outputBytes += chunk.length;
      const text = decoder.write(chunk);
      newlineCount += text.split("\n").length - 1;
      if (text) lastCharacter = text.at(-1);
      output = (output + text).slice(-captureChars);
      if (separateOutput) {
        if (decoder === stdout) stdoutText = (stdoutText + text).slice(-captureChars);
        else stderrText = (stderrText + text).slice(-captureChars);
      }
      try { onData?.(text); } catch (caught) { error ||= caught.message; stop(); }
    };
    try { child = spawn(command, args, { cwd, env, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] }); }
    catch (caught) { resolve({ exitCode: null, output, outputBytes, outputTruncated: false, aborted, timedOut, error: caught.message }); return; }
    child.stdout.on("data", chunk => append(chunk, stdout));
    child.stderr.on("data", chunk => append(chunk, stderr));
    child.stdin.on("error", () => {}); // An early exit can close stdin normally.
    if (stdinStream) stdinStream.pipe(child.stdin);
    else child.stdin.end(stdin === undefined ? undefined : String(stdin));
    child.once("error", caught => { error ||= caught.message; });
    const abort = () => { aborted = true; stop(); };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) { timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs); timer.unref(); }
    child.once("close", (exitCode, processSignal) => {
      clearTimeout(timer);
      if (!aborted && !timedOut && !error) clearTimeout(killTimer);
      signal?.removeEventListener("abort", abort);
      const stdoutEnd = stdout.end(), stderrEnd = stderr.end();
      output = (output + stdoutEnd + stderrEnd).slice(-captureChars);
      resolve({ exitCode, signal: processSignal, output, outputBytes, outputLines: newlineCount + (outputBytes && lastCharacter !== "\n" ? 1 : 0), outputTruncated: outputBytes > Buffer.byteLength(output), timedOut, aborted, ...(separateOutput ? { stdout: stdoutText + stdoutEnd, stderr: stderrText + stderrEnd } : {}), ...(error ? { error } : {}) });
    });
  });
}

module.exports = { CAPTURE_CHARS, runProcess, terminateProcess };
