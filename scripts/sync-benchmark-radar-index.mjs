// Refresh the bundled Benchmark Radar index used when no local checkout exists.
// Run before a release, or whenever the public index changes: npm run radar:sync
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { PUBLIC_INDEX_URL, fetchPublicIndex, writeIndexFile } = require("../electron/benchmark-radar-index.cjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const url = argument("url", PUBLIC_INDEX_URL);
const output = path.resolve(root, argument("out", path.join("electron", "assets", "benchmark-radar", "public-index.json")));

try {
  const result = await fetchPublicIndex({ url, timeoutMs: 240_000 });
  const index = { ...result.index, fetchedAt: result.fetchedAt, etag: result.etag };
  writeIndexFile(output, index);
  const bytes = fs.statSync(output).size;
  console.log(JSON.stringify({ source: url, output: path.relative(root, output), updatedAt: index.updatedAt, records: index.records.length, directions: index.directions.length, megabytes: Number((bytes / 1024 / 1024).toFixed(2)) }, null, 2));
} catch (failure) {
  console.error(`Could not refresh the Benchmark Radar index: ${failure instanceof Error ? failure.message : failure}`);
  process.exitCode = 1;
}
