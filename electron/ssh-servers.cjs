/**
 * SSH servers the user has added.
 *
 * Only connection coordinates are stored: no passwords, no key material. An
 * identity file is recorded by path and used as `ssh -i`, so the key stays in
 * the user's own ~/.ssh with its own permissions.
 *
 * The list lives in Electron user data, not in a workspace: a server belongs to
 * the machine you are sitting at, not to one project.
 */

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const FILE_NAME = "ssh-servers.json";
const ASKPASS_FILE = "ssh-askpass.sh";
const MAX_SERVERS = 20;
const DEFAULT_PORT = 22;
const DEFAULT_WORKSPACE = "~/.archimedes";
const TEST_MARKER = "archimedes-ok";

let filePath = "";
let userDataDirPath = "";
let codec = { encrypt: () => "", decrypt: () => "" };

function initialize(userDataDir, provided = null) {
  userDataDirPath = String(userDataDir || "");
  filePath = path.join(userDataDirPath, FILE_NAME);
  if (provided?.encrypt && provided?.decrypt) codec = provided;
}

function requirePath() {
  if (!filePath) throw new Error("SSH settings are not initialised yet.");
  return filePath;
}

function read() {
  try {
    const parsed = JSON.parse(fs.readFileSync(requirePath(), "utf8"));
    return { servers: Array.isArray(parsed?.servers) ? parsed.servers : [] };
  } catch (error) {
    if (error?.code === "ENOENT") return { servers: [] };
    return { servers: [] };
  }
}

function write(data) {
  const target = requirePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  // 0600: the file names hosts and users, which is not secret but is nobody
  // else's business on a shared machine.
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, target);
}

function text(value, limit) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

/** Accepts "user@host:2222" typing as well as separate fields. */
function splitTarget(value) {
  const raw = String(value || "").trim();
  const [userPart, hostPart] = raw.includes("@") ? raw.split("@") : ["", raw];
  const [host, port] = hostPart.split(":");
  return { user: userPart, host, port: port ? Number(port) : undefined };
}

function normalizeServer(input = {}) {
  const typed = splitTarget(input.host);
  const host = text(typed.host || input.host, 200).replace(/^ssh:\/\//i, "");
  const user = text(input.user || typed.user, 100);
  const port = Math.trunc(Number(input.port || typed.port || DEFAULT_PORT));
  if (!host) throw new Error("A server needs a host.");
  if (!/^[A-Za-z0-9_.:-]+$/.test(host)) throw new Error("That host name contains characters SSH will not accept.");
  if (!user) throw new Error("A server needs a user name.");
  if (!/^[A-Za-z0-9_.-]+$/.test(user)) throw new Error("That user name is not valid.");
  if (!Number.isFinite(port) || port < 1 || port > 65_535) throw new Error("The port must be between 1 and 65535.");
  const identityFile = text(input.identityFile, 400);
  if (identityFile && !path.isAbsolute(identityFile) && !identityFile.startsWith("~")) {
    throw new Error("The identity file must be an absolute path or start with ~.");
  }
  return {
    id: text(input.id, 60) || randomUUID(),
    name: text(input.name, 80) || `${user}@${host}`,
    host,
    user,
    port,
    identityFile,
    workspace: text(input.workspace, 200) || DEFAULT_WORKSPACE,
    useDocker: Boolean(input.useDocker),
    createdAt: text(input.createdAt, 40) || new Date().toISOString(),
  };
}

function listServers() {
  return read().servers.map(({ passwordCipher, ...server }) => ({
    ...server,
    identityFile: server.identityFile || "",
    hasPassword: Boolean(passwordCipher),
  }));
}

function findServer(id) {
  return read().servers.find((server) => server.id === String(id || "")) || null;
}

function saveServer(input = {}) {
  const data = read();
  const server = normalizeServer(input);
  const index = data.servers.findIndex((entry) => entry.id === server.id);
  const previous = index === -1 ? null : data.servers[index];
  // undefined keeps what is stored; "" clears it; a value replaces it.
  let passwordCipher = previous?.passwordCipher || "";
  if (typeof input.password === "string") {
    passwordCipher = input.password === "" ? "" : codec.encrypt(input.password);
    if (input.password !== "" && !passwordCipher) {
      throw new Error("This machine cannot store a password securely, so it was not saved. Use a key instead.");
    }
  }
  server.passwordCipher = passwordCipher;
  if (index === -1) {
    if (data.servers.length >= MAX_SERVERS) throw new Error(`Only ${MAX_SERVERS} servers can be saved. Remove one first.`);
    server.createdAt = new Date().toISOString();
    data.servers = [...data.servers, server];
  } else {
    server.createdAt = data.servers[index].createdAt || server.createdAt;
    data.servers = data.servers.map((entry) => (entry.id === server.id ? server : entry));
  }
  write(data);
  const { passwordCipher: _hidden, ...visible } = server;
  return { ...visible, hasPassword: Boolean(passwordCipher) };
}

function deleteServer(id) {
  const data = read();
  const next = data.servers.filter((entry) => entry.id !== String(id || ""));
  if (next.length === data.servers.length) throw new Error("That server does not exist.");
  write({ servers: next });
  return true;
}

/** The argv for one non-interactive connection. Exported so tests can assert it. */
function connectionArgs(server, remoteCommand, { allowPassword = false } = {}) {
  const args = [
    "-o", allowPassword ? "BatchMode=no" : "BatchMode=yes",
    "-o", "ConnectTimeout=10",
    "-o", "StrictHostKeyChecking=accept-new",
    "-p", String(server.port || DEFAULT_PORT),
  ];
  // spawn has no shell, so "~" would never be expanded and ssh would look for a
  // file literally named "~".
  if (server.identityFile) args.push("-i", expandHome(server.identityFile));
  args.push(`${server.user}@${server.host}`, remoteCommand);
  return args;
}

function expandHome(value) {
  const text = String(value || "");
  if (!text.startsWith("~")) return text;
  return path.join(process.env.HOME || "", text.slice(1));
}

/** A tiny askpass helper so a saved password can be used without a terminal. */
function ensureAskpass() {
  const target = path.join(userDataDirPath || require("node:os").tmpdir(), ASKPASS_FILE);
  fs.writeFileSync(target, "#!/bin/sh\nprintf '%s' \"$ARCHIMEDES_SSH_PASSWORD\"\n", { mode: 0o700 });
  fs.chmodSync(target, 0o700);
  return target;
}

function run(command, args, { timeoutMs = 25_000, env = {} } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    let child;
    try { child = spawn(command, args, { windowsHide: true, env: { ...process.env, ...env } }); }
    catch (error) { finish({ ok: false, detail: error?.message || "ssh could not start" }); return; }
    const output = [];
    child.stdout.on("data", (chunk) => output.push(chunk));
    child.stderr.on("data", (chunk) => output.push(chunk));
    child.once("error", (error) => finish({ ok: false, detail: error?.message || "ssh could not start" }));
    child.once("close", (code) => finish({ ok: code === 0, detail: Buffer.concat(output).toString("utf8").trim() }));
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish({ ok: false, detail: "The connection timed out." }); }, timeoutMs);
    if (timer.unref) timer.unref();
  });
}

/**
 * One round trip that proves the host, the user and the key all work. It runs a
 * harmless printf, not a login shell, so a broken profile on the server does not
 * look like a broken connection.
 */
async function testConnection(server) {
  const saved = server?.id ? findServer(server.id) : null;
  const typedPassword = typeof server?.password === "string" ? server.password : "";
  const target = normalizeServer({ ...saved, ...server });
  const password = typedPassword || codec.decrypt(saved?.passwordCipher || "");
  const args = connectionArgs(target, `printf ${TEST_MARKER}`, { allowPassword: Boolean(password) });
  const env = password
    ? { SSH_ASKPASS: ensureAskpass(), SSH_ASKPASS_REQUIRE: "force", ARCHIMEDES_SSH_PASSWORD: password }
    : {};
  const result = await run("ssh", args, { timeoutMs: 30_000, env });
  const reachable = result.ok && result.detail.includes(TEST_MARKER);
  return {
    ok: reachable,
    detail: reachable
      ? `Connected to ${target.user}@${target.host}:${target.port}.`
      : result.detail || "The server did not answer.",
  };
}

module.exports = {
  DEFAULT_PORT,
  DEFAULT_WORKSPACE,
  connectionArgs,
  deleteServer,
  initialize,
  listServers,
  normalizeServer,
  saveServer,
  testConnection,
};
