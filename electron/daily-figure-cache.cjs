const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { isArxivFigureUrl } = require("./literature.cjs");

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_THUMB_BYTES = 512 * 1024;
const CACHE_TTL = 24 * 60 * 60 * 1000;
const FAILURE_TTL = 2 * 60 * 1000;
function isFigureSource(value) {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}
const ID = /^\d{4}\.\d{4,5}$/;

function limitConcurrency(maximum) {
  let active = 0;
  const waiting = [];
  return async task => {
    if (active < maximum) active++;
    else await new Promise(resolve => waiting.push(resolve));
    try { return await task(); }
    finally { const next = waiting.shift(); if (next) next(); else active--; }
  };
}

async function fetchFigure(url, fetchImpl) {
  const signal = AbortSignal.timeout(6_000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!isArxivFigureUrl(url)) throw Error("Unsupported figure host.");
    const response = await fetchImpl(url, { redirect: "manual", signal, headers: { Accept: "image/*", "User-Agent": "Archimedes-Research/0.1" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel?.();
      const location = response.headers.get("location");
      if (!location) throw Error("Missing image redirect.");
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok || Number(response.headers.get("content-length")) > MAX_SOURCE_BYTES) {
      await response.body?.cancel?.(); throw Error("Figure unavailable or too large.");
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_SOURCE_BYTES) throw Error("Figure is too large.");
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks, size);
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  throw Error("Too many image redirects.");
}

function rasterSize(data) {
  if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return [data.readUInt32BE(16), data.readUInt32BE(20)];
  if (data[0] === 255 && data[1] === 216) {
    let offset = 2;
    while (offset + 8 < data.length) {
      if (data[offset++] !== 255) break;
      while (data[offset] === 255) offset++;
      const marker = data[offset++];
      if (marker === 216 || marker === 1 || marker >= 208 && marker <= 215) continue;
      if (marker === 217 || marker === 218) break;
      const length = data.readUInt16BE(offset);
      if (length < 2 || offset + length > data.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) return [data.readUInt16BE(offset + 5), data.readUInt16BE(offset + 3)];
      offset += length;
    }
  }
  throw Error("Unsupported raster format.");
}

async function makeThumbnail(data) {
  const { createCanvas, loadImage } = require("@napi-rs/canvas");
  let input = data;
  if (/^\s*(?:<\?xml[^>]*>\s*|<!--[\s\S]*?-->\s*)*<svg\b/i.test(data.subarray(0, 1024).toString())) {
    let svg = data.toString("utf8");
    if (data.length > 2 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b|@import/i.test(svg)) throw Error("Unsupported SVG.");
    for (const match of svg.matchAll(/(?:href\s*=\s*["']([^"']*)["']|url\(\s*["']?([^\s)'" ]+))/gi)) {
      if (!(match[1] || match[2]).startsWith("#")) throw Error("External SVG resource.");
    }
    const root = svg.match(/<svg\b[^>]*>/i)?.[0];
    if (!root) throw Error("Invalid SVG.");
    const viewBox = root.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1].trim().split(/[\s,]+/).map(Number);
    const dimensions = viewBox?.length === 4 ? viewBox.slice(2) : [Number.parseFloat(root.match(/\bwidth\s*=\s*["']([^"']+)/i)?.[1]), Number.parseFloat(root.match(/\bheight\s*=\s*["']([^"']+)/i)?.[1])];
    if (!dimensions.every(value => Number.isFinite(value) && value > 0)) throw Error("SVG dimensions unavailable.");
    const scale = Math.min(416 / dimensions[0], 416 / dimensions[1]);
    const sized = root.replace(/\s(?:width|height|style)\s*=\s*["'][^"']*["']/gi, "").replace(/>$/, ` width="${Math.max(1, Math.round(dimensions[0] * scale))}" height="${Math.max(1, Math.round(dimensions[1] * scale))}">`);
    svg = svg.replace(root, sized);
    input = Buffer.from(svg);
  } else {
    const [width, height] = rasterSize(data);
    if (!width || !height || width * height > 16_000_000 || width > 8192 || height > 8192) throw Error("Figure dimensions too large.");
  }
  const image = await loadImage(input);
  const scale = Math.min(1, 416 / image.width, 416 / image.height);
  const canvas = createCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
  const context = canvas.getContext("2d");
  context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const output = await canvas.encode("jpeg", 82);
  if (!output.length || output.length > MAX_THUMB_BYTES) throw Error("Thumbnail is too large.");
  return output;
}

function createDailyFigureCache({ directory, resolveFigure, fetchImpl = fetch, transform = makeThumbnail, now = Date.now, maxEntries = 256, maxBytes = 64 * 1024 * 1024 }) {
  const sources = new Map(), thumbnails = new Map();
  const download = limitConcurrency(2), decode = limitConcurrency(1);
  let pruneTask = null, pruneAgain = false;
  const metadataPath = id => path.join(directory, `${id}.json`);
  const imagePath = (id, source) => path.join(directory, `${id}-${createHash("sha256").update(source).digest("hex").slice(0, 16)}.jpg`);
  async function read(id) {
    try {
      if ((await fs.stat(metadataPath(id))).size > 2048) return null;
      const entry = JSON.parse(await fs.readFile(metadataPath(id), "utf8"));
      const ttl = entry.source ? CACHE_TTL : FAILURE_TTL;
      return Number.isFinite(entry.at) && now() - entry.at >= 0 && now() - entry.at < ttl && (!entry.source || isFigureSource(entry.source)) ? entry : null;
    } catch { return null; }
  }
  async function atomicWrite(file, data) {
    await fs.mkdir(directory, { recursive: true });
    const temporary = `${file}.tmp-${randomUUID()}`;
    try { await fs.writeFile(temporary, data); await fs.rename(temporary, file); }
    finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
  }
  async function prune() {
    pruneAgain = true;
    if (pruneTask) return pruneTask;
    pruneTask = (async () => {
      do {
        pruneAgain = false;
        const names = await fs.readdir(directory);
        const files = (await Promise.all(names.filter(name => /^\d{4}\.\d{4,5}(?:-[a-f0-9]{16}\.jpg|\.json)$/.test(name)).map(async name => {
          try { const stat = await fs.stat(path.join(directory, name)); return { name, ...stat }; } catch { return null; }
        }))).filter(Boolean).sort((a, b) => b.mtimeMs - a.mtimeMs);
        let bytes = 0, records = 0, images = 0;
        for (const file of files) {
          bytes += file.size;
          if (file.name.endsWith(".json")) records++;
          else images++;
          if (bytes > maxBytes || records > maxEntries || images > maxEntries || now() - file.mtimeMs > CACHE_TTL) await fs.rm(path.join(directory, file.name), { force: true });
        }
      } while (pruneAgain);
    })().catch(() => {}).finally(() => { pruneTask = null; });
    return pruneTask;
  }
  async function source(id) {
    const cached = await read(id);
    if (cached) return cached;
    if (sources.has(id)) return sources.get(id);
    if (sources.size >= 64) return { source: "", at: now() };
    const task = (async () => {
      const url = await resolveFigure(id);
      const entry = { source: isFigureSource(url) ? url : "", at: now() };
      await atomicWrite(metadataPath(id), JSON.stringify(entry)).catch(() => {});
      await prune();
      return entry;
    })().finally(() => sources.delete(id));
    sources.set(id, task);
    return task;
  }
  async function get(id, { thumbnail = false } = {}) {
    if (typeof id !== "string" || !ID.test(id)) return "";
    const entry = await source(id);
    if (!entry.source || !thumbnail) return entry.source;
    const file = imagePath(id, entry.source);
    try {
      const stat = await fs.stat(file);
      if (stat.size > 0 && stat.size <= MAX_THUMB_BYTES && now() - stat.mtimeMs < CACHE_TTL) {
        const bytes = await fs.readFile(file);
        if (bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217) return `data:image/jpeg;base64,${bytes.toString("base64")}`;
      }
    } catch { /* Generate a missing or expired thumbnail below. */ }
    // Browser-supported formats that we cannot safely resize should not be downloaded twice.
    if (!isArxivFigureUrl(entry.source) || !/\.(?:png|jpe?g|svg)(?:[?#]|$)/i.test(entry.source) || entry.failedUntil > now()) return entry.source;
    if (thumbnails.has(id)) return thumbnails.get(id);
    if (thumbnails.size >= 32) return entry.source;
    const task = download(async () => {
      try {
        const original = await fetchFigure(entry.source, fetchImpl);
        const small = await decode(() => transform(original));
        await atomicWrite(file, small).then(prune).catch(() => {});
        return `data:image/jpeg;base64,${small.toString("base64")}`;
      } catch {
        await atomicWrite(metadataPath(id), JSON.stringify({ ...entry, failedUntil: now() + FAILURE_TTL })).catch(() => {});
        return entry.source; // Preserve previews when a format cannot be rasterized.
      }
    }).finally(() => thumbnails.delete(id));
    thumbnails.set(id, task);
    return task;
  }
  return { get };
}

module.exports = { createDailyFigureCache, makeThumbnail, fetchFigure };
