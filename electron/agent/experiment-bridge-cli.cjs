const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
function fail(message) { process.stderr.write(`${message}\n`); process.exitCode = 1; }
const [connectionFile, method, json = "{}"] = process.argv.slice(2);
if (!connectionFile || !method || Buffer.byteLength(json) > 100000) fail("Usage: experiment-bridge <connection> <tool> '<json object>'");
else {
  let requestPath, responsePath, poll, heartbeat, timer;
  const cleanup = () => {
    clearInterval(poll); clearInterval(heartbeat); clearTimeout(timer);
    for (const file of [requestPath, responsePath]) if (file) { try { fs.unlinkSync(file); } catch { /* already removed */ } }
  };
  try {
    const connection = JSON.parse(fs.readFileSync(connectionFile, "utf8"));
    const args = JSON.parse(json);
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Arguments must be a JSON object.");
    if (path.dirname(connectionFile) !== connection.directory) throw new Error("Invalid experiment connection.");
    const id = randomBytes(16).toString("hex");
    requestPath = path.join(connection.directory, `${id}.request`);
    responsePath = path.join(connection.directory, `${id}.response`);
    // Publish atomically: the server must never read a partially written JSON file.
    const temp = path.join(connection.directory, `${id}.tmp`);
    try { fs.writeFileSync(temp, JSON.stringify({ secret: connection.secret, method, arguments: args, pid: process.pid }), { mode: 0o600, flag: "wx" }); fs.renameSync(temp, requestPath); }
    catch (error) { try { fs.unlinkSync(temp); } catch {} throw error; }
    heartbeat = setInterval(() => { try { if (!fs.existsSync(connectionFile)) throw new Error("Bridge closed"); const now = new Date(); fs.utimesSync(requestPath, now, now); } catch { cleanup(); fail("Experiment bridge is no longer available."); } }, 1000);
    poll = setInterval(() => {
      if (!fs.existsSync(responsePath)) return;
      try {
        const info = fs.lstatSync(responsePath);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024) throw new Error("Invalid experiment bridge response.");
        const response = JSON.parse(fs.readFileSync(responsePath, "utf8"));
        cleanup();
        if (response.error) fail(response.error); else process.stdout.write(`${JSON.stringify(response.result)}\n`);
      } catch (error) { cleanup(); fail(error.message); }
    }, 100);
    timer = setTimeout(() => { cleanup(); fail("Experiment request timed out."); }, 180000);
    for (const sig of ["SIGINT", "SIGTERM"]) process.once(sig, () => { cleanup(); process.exitCode = 1; });
  } catch (error) { cleanup(); fail(error.message); }
}
