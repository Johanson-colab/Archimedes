const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const clients = new Set();

function executableCandidates(binary = "codex") {
  if (binary !== "codex") {
    if (!path.isAbsolute(binary) || !fs.statSync(binary, { throwIfNoEntry: false })?.isFile()) throw new Error("Choose an existing absolute Codex executable path.");
    return [binary];
  }
  const names = process.platform === "win32" ? ["codex.exe", "codex.cmd"] : ["codex"];
  const dirs = [...String(process.env.PATH || "").split(path.delimiter), "/opt/homebrew/bin", "/usr/local/bin", path.join(os.homedir(), ".local/bin"), path.join(os.homedir(), ".npm-global/bin")];
  return dirs.filter((dir) => path.isAbsolute(dir)).flatMap((dir) => names.map((name) => path.join(dir, name))).filter((file) => fs.statSync(file, { throwIfNoEntry: false })?.isFile());
}

class CodexClient extends EventEmitter {
  constructor({ binary = "codex", spawnImpl = spawn, requestTimeout = 20_000 } = {}) {
    super();
    this.binary = binary;
    this.spawnImpl = spawnImpl;
    this.requestTimeout = requestTimeout;
    this.pending = new Map();
    this.nextId = 0;
    this.closed = false;
    this.buffer = "";
  }

  async start() {
    const binary = this.spawnImpl === spawn ? executableCandidates(this.binary)[0] : this.binary;
    if (!binary) throw new Error("Codex CLI was not found. Install Codex and run codex login, or set its absolute executable path.");
    // Never use a shell or expose an app-server network listener.
    if (process.platform === "win32" && binary.endsWith(".cmd")) throw new Error("Select the native codex.exe executable; Windows .cmd launchers are not supported yet.");
    const env = { ...process.env };
    delete env.CODEX_THREAD_ID;
    this.child = this.spawnImpl(binary, ["app-server", "--listen", "stdio://"], { stdio: ["pipe", "pipe", "pipe"], env, windowsHide: true, detached: process.platform !== "win32" });
    clients.add(this);
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.read(chunk));
    // Do not surface stderr: inherited configuration can contain secrets.
    this.child.stderr?.on("data", () => {});
    this.child.on("error", () => this.fail(new Error("Codex could not start. Check the executable and installation.")));
    this.child.on("exit", () => this.fail(new Error("Codex app-server exited. The turn was not replayed; inspect any changes before retrying.")));
    this.child.stdin.on("error", () => this.fail(new Error("Codex input connection closed.")));
    await this.request("initialize", { clientInfo: { name: "archimedes", title: "Archimedes", version: "0.1.0" }, capabilities: { experimentalApi: true, optOutNotificationMethods: ["item/reasoning/textDelta", "item/reasoning/summaryTextDelta", "item/reasoning/summaryPartAdded"] } });
    this.send({ method: "initialized" });
    return this;
  }

  read(chunk) {
    if (this.closed) return;
    this.buffer += chunk;
    if (this.buffer.length > 8_000_000) return this.fail(new Error("Codex sent an oversized protocol message."));
    let index;
    while ((index = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch { this.fail(new Error("Codex sent invalid JSON.")); return; }
      if (!message || typeof message !== "object" || Array.isArray(message)) { this.fail(new Error("Codex sent an invalid protocol object.")); return; }
      if (Object.hasOwn(message, "id") && !message.method) {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(`Codex rejected ${pending.method} (${message.error.code ?? "unknown"}). Check Codex configuration and account access.`));
        else pending.resolve(message.result);
      } else if (message.method) this.emit("message", message);
    }
  }

  send(message) {
    if (this.closed || !this.child?.stdin.writable) throw new Error("Codex connection is closed.");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params = {}) {
    if (this.closed) return Promise.reject(new Error("Codex connection is closed."));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} timed out. No request was replayed.`));
      }, this.requestTimeout);
      this.pending.set(id, { resolve, reject, timer, method });
      try { this.send({ id, method, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  respond(id, result) { this.send({ id, result }); }
  unsupported(id) { this.send({ id, error: { code: -32601, message: "This Archimedes client does not support this request; it was not approved." } }); }

  fail(error) {
    if (this.closed) return;
    this.closed = true;
    clients.delete(this);
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.emit("closed", error);
    this.terminate();
  }

  terminate() {
    if (!this.child || this.child.exitCode !== null) return;
    try {
      if (process.platform !== "win32" && this.child.pid) process.kill(-this.child.pid, "SIGTERM");
      else this.child.kill();
    } catch { this.child.kill(); }
    const child = this.child;
    const timer = setTimeout(() => {
      if (child.exitCode !== null) return;
      try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); } catch { /* already exited */ }
    }, 2_000);
    timer.unref();
  }

  close() { this.fail(new Error("Codex connection closed.")); }
}

function closeAllCodexClients() { for (const client of [...clients]) client.close(); }
module.exports = { CodexClient, executableCandidates, closeAllCodexClients };
