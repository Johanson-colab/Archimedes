const path = require("node:path");
const { createSupabaseServer } = require("./supabase-server.cjs");

const config = require(path.resolve(__dirname, "..", "shared", "supabase-config.json"));
const port = Number(process.env.PORT) || 8788;
const host = process.env.HOST || "127.0.0.1";

const app = createSupabaseServer({ supabaseUrl: config.url, publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || config.publishableKey });
app.listen(port, host).then(() => {
  console.log(`Archimedes Supabase API listening on http://${host}:${port}`);
  console.log(`Supabase: ${config.url}`);
}).catch((error) => { console.error(error); process.exitCode = 1; });

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { void app.close().finally(() => process.exit(0)); });
