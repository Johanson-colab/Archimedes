const os = require("node:os");
const { createCollabServer } = require("./collab-server.cjs");

const port = Number(process.env.PORT) || 8787;
const host = process.env.HOST || "0.0.0.0";
const dbPath = process.env.DB_PATH || "data/collab.db";
const devAuth = process.env.DEV_AUTH !== "false";

const app = createCollabServer({ dbPath, devAuth });
app.listen(port, host).then(() => {
  console.log(`Archimedes LAN host listening on port ${port}`);
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family !== "IPv4" || address.internal) continue;
      console.log(`  ${name}: http://${address.address}:${port}`);
    }
  }
  console.log(`Database: ${dbPath}`);
  console.log(devAuth ? "Dev auth: enabled (LAN only; put this behind a trusted network)" : "Dev auth: disabled");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void app.close().finally(() => process.exit(0));
  });
}
