const { createCollabServer } = require("./collab-server.cjs");

const port = Number(process.env.PORT) || 8787;
const host = process.env.HOST || "127.0.0.1";
const dbPath = process.env.DB_PATH || "data/collab.db";
const devAuth = process.env.DEV_AUTH !== "false";

const app = createCollabServer({ dbPath, devAuth });
app.listen(port, host).then(() => {
  console.log(`Archimedes collaboration server listening on http://${host}:${port}`);
  console.log(`Database: ${dbPath}`);
  console.log(`Dev auth: ${devAuth ? "enabled (development only)" : "disabled"}`);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void app.close().finally(() => process.exit(0));
  });
}
