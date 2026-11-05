// Deterministic, offline before/after measurements; never touches the user's cache.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { resolveArxivFigure } = require("../electron/literature.cjs");
const { createDailyFigureCache } = require("../electron/daily-figure-cache.cjs");
const before = new Module(path.join(root, "electron/literature-before.cjs"));
before.filename = path.join(root, "electron/literature-before.cjs"); before.paths = Module._nodeModulePaths(path.join(root, "electron"));
before._compile(execFileSync("git", ["show", "200b764:electron/literature.cjs"], { cwd: root, encoding: "utf8" }), before.filename);
const prefix = '<html><body><figure><img src="2611.99991v1/figure.png"></figure>';
const html = Buffer.from(prefix + " ".repeat(4 * 1024 * 1024 - prefix.length));
function htmlFetch(stats) {
  return async () => {
    let offset = 0;
    return new Response(new ReadableStream({
      pull(controller) {
        if (offset >= html.length) return controller.close();
        const chunk = html.subarray(offset, offset + 64 * 1024);
        offset += chunk.length; stats.bytes += chunk.length; controller.enqueue(chunk);
      },
      cancel() { stats.cancelled = true; },
    }, { highWaterMark: 0 }));
  };
}
const oldHtml = { bytes: 0, cancelled: false }, newHtml = { bytes: 0, cancelled: false };
assert.equal(await before.exports.resolveArxivFigure("2611.99991", htmlFetch(oldHtml)), await resolveArxivFigure("2611.99991", htmlFetch(newHtml)));
assert.ok(newHtml.cancelled && newHtml.bytes < oldHtml.bytes);

const canvas = createCanvas(1600, 800), context = canvas.getContext("2d");
const pixels = context.createImageData(1600, 800);
let random = 123456;
for (let i = 0; i < pixels.data.length; i += 4) {
  random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
  pixels.data[i] = random & 255; pixels.data[i + 1] = random >>> 8 & 255; pixels.data[i + 2] = random >>> 16 & 255; pixels.data[i + 3] = 255;
}
context.putImageData(pixels, 0, 0);
const original = canvas.toBuffer("image/png");
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "daily-figure-benchmark-"));
let lookups = 0, downloads = 0;
try {
  const originalUrl = "https://arxiv.org/html/2611.99992v1/figure.png";
  const dependencies = { directory, resolveFigure: async () => { lookups++; return originalUrl; }, fetchImpl: async () => { downloads++; return new Response(original); } };
  const first = await createDailyFigureCache(dependencies).get("2611.99992", { thumbnail: true });
  assert.ok(first.startsWith("data:image/jpeg;base64,"));
  const jpeg = Buffer.from(first.split(",")[1], "base64"), image = await loadImage(jpeg);
  const cold = { lookups, downloads };
  const restarted = createDailyFigureCache(dependencies);
  assert.equal(await restarted.get("2611.99992", { thumbnail: true }), first);
  assert.equal(await restarted.get("2611.99992"), originalUrl);
  const result = {
    fixture: "offline synthetic 4 MiB HTML, first figure in first chunk; 1600x800 noise PNG",
    baseline: "200b764",
    html: { beforeBytes: oldHtml.bytes, afterBytes: newHtml.bytes, remainderCancelled: newHtml.cancelled },
    image: { originalBytes: original.length, thumbnailBytes: jpeg.length, originalDimensions: [1600, 800], thumbnailDimensions: [image.width, image.height] },
    coldCache: cold,
    afterCacheRestart: { additionalLookups: lookups - cold.lookups, additionalImageDownloads: downloads - cold.downloads, originalPreviewPreserved: true },
  };
  assert.equal(lookups, 1); assert.equal(downloads, 1); assert.ok(jpeg.length < original.length); assert.equal(image.width, 416); assert.equal(image.height, 208);
  const output = path.join(root, "docs/assets/daily-paper-preview-performance");
  await fs.mkdir(output, { recursive: true }); await fs.writeFile(path.join(output, "benchmark.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} finally { await fs.rm(directory, { recursive: true, force: true }); }
