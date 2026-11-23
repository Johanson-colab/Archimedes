const test = require("node:test");
const assert = require("node:assert/strict");
const { downloadConferenceCatalog } = require("./conference-download.cjs");
const CHUNK = 1024 * 1024;
const data = Buffer.from(JSON.stringify({ results: [{ title: "Official record", abstract: "字".repeat(CHUNK) }] }));
function segment(headers, options = {}) {
  const [, startText, endText] = /bytes=(\d+)-(\d+)/.exec(headers.Range);
  const start = Number(startText), end = Math.min(data.length - 1, Number(endText));
  return new Response(data.subarray(start, end + 1), { status: 206, headers: { "content-range": `bytes ${start}-${end}/${data.length}`, etag: '"version-1"', ...options } });
}

test("validated ranges reconstruct UTF-8 JSON and cap concurrent transfers at three", async () => {
  let active = 0, peak = 0;
  const calls = [];
  const result = await downloadConferenceCatalog("https://icml.cc/catalog.json", { fetchImpl: async (_url, { headers }) => {
    calls.push(headers); active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2)); active--;
    if (!headers.Range.startsWith("bytes=0-")) assert.equal(headers["If-Range"], '"version-1"');
    return segment(headers);
  } });
  assert.equal(result, data.toString("utf8")); assert.equal(JSON.parse(result).results[0].title, "Official record");
  assert.equal(calls.length, Math.ceil(data.length / CHUNK)); assert.equal(peak, 3);
});

test("a premature stream close retries only the affected segment", async () => {
  const calls = new Map();
  const result = await downloadConferenceCatalog("https://icml.cc/catalog.json", { fetchImpl: async (_url, { headers }) => {
    const count = (calls.get(headers.Range) || 0) + 1; calls.set(headers.Range, count);
    if (headers.Range === `bytes=${CHUNK}-${CHUNK * 2 - 1}` && count === 1) {
      return new Response(new ReadableStream({ start(controller) { controller.error(new DOMException("Premature close", "AbortError")); } }), { status: 206, headers: { "content-range": `bytes ${CHUNK}-${CHUNK * 2 - 1}/${data.length}`, etag: '"version-1"' } });
    }
    return segment(headers);
  } });
  assert.equal(result, data.toString("utf8"));
  assert.equal(calls.get(`bytes=${CHUNK}-${CHUNK * 2 - 1}`), 2);
  assert.equal(calls.get(`bytes=0-${CHUNK - 1}`), 1);
});

test("servers ignoring Range are downloaded once and missing editions remain distinct", async () => {
  let calls = 0;
  assert.equal(await downloadConferenceCatalog("https://icml.cc/catalog.json", { fetchImpl: async () => { calls++; return new Response(data); } }), data.toString());
  assert.equal(calls, 1);
  assert.equal(await downloadConferenceCatalog("https://icml.cc/missing.json", { fetchImpl: async () => new Response("", { status: 404 }) }), null);
});

test("changed validators, invalid ranges and oversized catalogs never produce a mixed catalog", async () => {
  for (const type of ["changed", "invalid", "oversized"]) {
    await assert.rejects(downloadConferenceCatalog("https://icml.cc/catalog.json", { fetchImpl: async (_url, { headers }) => {
      if (type === "oversized") return new Response("", { status: 206, headers: { "content-range": "bytes 0-1048575/90000000" } });
      if (type === "invalid") return segment(headers, { "content-range": `bytes 1-${CHUNK}/${data.length}` });
      return segment(headers, headers["If-Range"] ? { etag: '"version-2"' } : {});
    } }), /changed|invalid/);
  }
});

test("rate limits and access errors do not trigger a retry storm", async () => {
  for (const status of [403, 429]) {
    let calls = 0;
    await assert.rejects(downloadConferenceCatalog("https://icml.cc/catalog.json", { fetchImpl: async () => { calls++; return new Response("", { status }); } }), new RegExp(String(status)));
    assert.equal(calls, 1);
  }
});

test("a shared deadline bounds a stalled download and hides low-level AbortError", async () => {
  await assert.rejects(downloadConferenceCatalog("https://icml.cc/catalog.json", { timeoutMs: 20, partTimeoutMs: 10, fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }) }), /timed out|connection.*interrupted/);
});

test("a ranged server without a version validator falls back to one normal response", async () => {
  let calls = 0;
  const result = await downloadConferenceCatalog("https://icml.cc/catalog.json", { fetchImpl: async (_url, { headers }) => {
    calls++;
    if (!headers.Range) return new Response(data);
    const response = segment(headers); response.headers.delete("etag"); return response;
  } });
  assert.equal(result, data.toString()); assert.equal(calls, 2);
});
