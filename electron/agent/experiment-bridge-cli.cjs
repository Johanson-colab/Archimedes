const fs = require("node:fs");
const net = require("node:net");

function fail(message) { process.stderr.write(`${message}\n`); process.exitCode = 1; }
const [connectionFile, method, json = "{}"] = process.argv.slice(2);
if (!connectionFile || !method || Buffer.byteLength(json) > 100000) { fail("Usage: experiment-bridge <connection> <tool> '<json object>'"); }
else {
  try {
    const connection = JSON.parse(fs.readFileSync(connectionFile, "utf8"));
    const args = JSON.parse(json);
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Arguments must be a JSON object.");
    const socket = net.createConnection(connection.socketPath);
    let output = "", finished = false;
    socket.setEncoding("utf8");
    socket.setTimeout(180000, () => socket.destroy(new Error("Experiment request timed out.")));
    socket.on("connect", () => socket.write(`${JSON.stringify({ secret: connection.secret, method, arguments: args })}\n`));
    socket.on("data", (chunk) => {
      output += chunk;
      if (Buffer.byteLength(output) > 1024 * 1024) return socket.destroy(new Error("Experiment response exceeded the size limit."));
      const end = output.indexOf("\n");
      if (end < 0 || finished) return;
      finished = true;
      try {
        const response = JSON.parse(output.slice(0, end));
        if (response.error) fail(response.error);
        else process.stdout.write(`${JSON.stringify(response.result)}\n`);
      } catch { fail("Invalid experiment bridge response."); }
      socket.end();
    });
    socket.on("error", (error) => { if (!finished) { finished = true; fail(error.message); } });
    socket.on("end", () => { if (!finished) { finished = true; fail("Experiment bridge closed before responding."); } });
  } catch (error) { fail(error.message); }
}
