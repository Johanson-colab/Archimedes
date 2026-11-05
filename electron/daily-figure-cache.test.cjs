const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { createDailyFigureCache, makeThumbnail, fetchFigure } = require("./daily-figure-cache.cjs");

const source = id => `https://arxiv.org/html/${id}v1/figure.png`;
const canvas = createCanvas(1200, 600);
canvas.getContext("2d").fillRect(0, 0, 1200, 600);
const png = canvas.toBuffer("image/png");
async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "daily-figures-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, cache: createDailyFigureCache({ directory, resolveFigure: async id => source(id), fetchImpl: async () => new Response(png), ...options }) };
}

test("raster and vector thumbnails retain aspect ratio and fit a 416px box", async () => {
  for (const input of [png, Buffer.from('<?xml version="1.0"?><!-- figure --><svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600"><rect width="1200" height="600" fill="white"/><path d="M20 500L900 20" stroke="black"/></svg>')]) {
    const output = await makeThumbnail(input), image = await loadImage(output);
    assert.equal(image.width, 416); assert.equal(image.height, 208);
    assert.ok(output.length < 512 * 1024);
    assert.equal(output.subarray(0, 2).toString("hex"), "ffd8");
  }
  const jpeg = await canvas.encode("jpeg", 90);
  assert.equal((await loadImage(await makeThumbnail(jpeg))).width, 416);
});

test("oversized rasters and external SVG resources are refused before rendering", async () => {
  const oversized = Buffer.from(png); oversized.writeUInt32BE(100_000, 16);
  await assert.rejects(makeThumbnail(oversized), /dimensions/);
  await assert.rejects(makeThumbnail(Buffer.from('<svg width="100" height="100"><image href="file:///etc/passwd"/></svg>')), /External/);
});

test("thumbnail requests coalesce and survive a fresh cache instance without network", async t => {
  let lookups = 0, downloads = 0;
  const { directory, cache } = await fixture(t, { resolveFigure: async id => { lookups++; return source(id); }, fetchImpl: async () => { downloads++; return new Response(png); } });
  const [first, second] = await Promise.all([cache.get("2611.00001", { thumbnail: true }), cache.get("2611.00001", { thumbnail: true })]);
  assert.ok(first.startsWith("data:image/jpeg;base64,")); assert.equal(first, second);
  assert.equal(lookups, 1); assert.equal(downloads, 1);
  const restarted = createDailyFigureCache({ directory, resolveFigure: async () => { throw Error("network should not run"); }, fetchImpl: async () => { throw Error("network should not run"); } });
  assert.equal(await restarted.get("2611.00001", { thumbnail: true }), first);
  assert.equal(await restarted.get("2611.00001"), source("2611.00001"), "large previews keep the full original URL");
});

test("corrupt thumbnails regenerate and corrupt metadata is safely replaced", async t => {
  let downloads = 0;
  const { directory, cache } = await fixture(t, { fetchImpl: async () => { downloads++; return new Response(png); } });
  await cache.get("2611.00002", { thumbnail: true });
  const file = (await fs.readdir(directory)).find(name => name.endsWith(".jpg"));
  await fs.writeFile(path.join(directory, file), "corrupt");
  assert.ok((await cache.get("2611.00002", { thumbnail: true })).startsWith("data:"));
  assert.equal(downloads, 2);
  await fs.writeFile(path.join(directory, "2611.00002.json"), "invalid");
  assert.equal(await cache.get("2611.00002"), source("2611.00002"));
});

test("failed thumbnail generation falls back to the original and has a short cooldown", async t => {
  let time = Date.now(), downloads = 0;
  const { cache } = await fixture(t, { now: () => time, fetchImpl: async () => { downloads++; throw Error("offline"); } });
  assert.equal(await cache.get("2611.00003", { thumbnail: true }), source("2611.00003"));
  await cache.get("2611.00003", { thumbnail: true }); assert.equal(downloads, 1);
  time += 121_000;
  await cache.get("2611.00003", { thumbnail: true }); assert.equal(downloads, 2);
});

test("expired sources refresh, misses retry soon, and non-arXiv originals stay browser-only", async t => {
  let time = Date.now(), lookups = 0, current = "";
  const { cache } = await fixture(t, { now: () => time, resolveFigure: async () => { lookups++; return current; }, fetchImpl: async () => { throw Error("external hosts must not be fetched"); } });
  assert.equal(await cache.get("2611.00004"), "");
  await cache.get("2611.00004"); assert.equal(lookups, 1);
  time += 121_000; current = "https://research.example/figure.png";
  assert.equal(await cache.get("2611.00004", { thumbnail: true }), current); assert.equal(lookups, 2);
  time += 24 * 60 * 60 * 1000 + 1;
  await cache.get("2611.00004"); assert.equal(lookups, 3);
  assert.equal(await cache.get("../../secret", { thumbnail: true }), "");
});

test("source records and disk usage remain bounded", async t => {
  const { directory, cache } = await fixture(t, { maxEntries: 2, maxBytes: 20_000 });
  for (let i = 10; i < 16; i++) await cache.get(`2611.000${i}`, { thumbnail: true });
  const files = await fs.readdir(directory);
  assert.ok(files.filter(name => name.endsWith(".json")).length <= 2);
  assert.ok(files.filter(name => name.endsWith(".jpg")).length <= 2);
  const sizes = await Promise.all(files.map(async name => (await fs.stat(path.join(directory, name))).size));
  assert.ok(sizes.reduce((a, b) => a + b, 0) <= 20_000);
});

test("image downloads reject foreign redirects and overlarge bodies", async () => {
  let calls = 0;
  await assert.rejects(fetchFigure(source("2611.00006"), async () => { calls++; return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }); }), /host/);
  assert.equal(calls, 1);
  await assert.rejects(fetchFigure(source("2611.00006"), async () => new Response("x", { headers: { "content-length": String(9 * 1024 * 1024) } })), /large/);
});

test("a read-only or unavailable disk cache still returns the generated thumbnail", async t => {
  const { directory } = await fixture(t);
  const blocked = path.join(directory, "not-a-directory");
  await fs.writeFile(blocked, "existing file");
  const cache = createDailyFigureCache({ directory: blocked, resolveFigure: async id => source(id), fetchImpl: async () => new Response(png) });
  assert.ok((await cache.get("2611.00007", { thumbnail: true })).startsWith("data:image/jpeg;base64,"));
});

test("GIF and WebP previews keep their original without an extra backend download", async t => {
  let downloads = 0;
  const { cache } = await fixture(t, { resolveFigure: async id => `https://arxiv.org/html/${id}v1/figure.${id.endsWith("8") ? "gif" : "webp"}`, fetchImpl: async () => { downloads++; return new Response(png); } });
  assert.ok((await cache.get("2611.00008", { thumbnail: true })).endsWith(".gif"));
  assert.ok((await cache.get("2611.00009", { thumbnail: true })).endsWith(".webp"));
  assert.equal(downloads, 0);
});
