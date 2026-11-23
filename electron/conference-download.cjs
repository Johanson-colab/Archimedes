// Official virtual-conference catalogs can be tens of MB. Small validated ranges
// avoid losing the entire transfer when a proxy closes a long-lived connection.
const MAX_BYTES = 80_000_000;
const CHUNK_BYTES = 1024 * 1024;
const TRANSIENT_STATUS = new Set([408, 500, 502, 503, 504]);

function transferError(message, retryable = false) {
  const error = new Error(message);
  error.retryable = retryable;
  return error;
}

async function readBytes(response, limit) {
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body || []) {
    length += chunk.byteLength;
    if (length > limit) throw transferError("Official catalog exceeded the download size limit.");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, length);
}

async function downloadConferenceCatalog(url, { fetchImpl = fetch, timeoutMs = 60000, partTimeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);
  try {
    async function part(start, end, validator, ranged = true) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(partTimeoutMs)]);
        try {
          const headers = { Accept: "application/json", "User-Agent": "Archimedes-Research/0.1", "Accept-Encoding": "identity" };
          if (ranged) headers.Range = `bytes=${start}-${end}`;
          if (validator) headers["If-Range"] = validator;
          const response = await fetchImpl(url, { headers, signal });
          if ([404, 410].includes(response.status) && start === 0) return null;
          if (!response.ok) throw transferError(`Official source returned HTTP ${response.status}: ${url}`, TRANSIENT_STATUS.has(response.status));
          if (response.status === 200) {
            if (start !== 0) throw transferError("The official catalog changed during download. Please retry.");
            // Range is optional HTTP behavior. A server that ignores it is read
            // once as a normal response, never once per requested segment.
            const bytes = await readBytes(response, MAX_BYTES);
            const expected = Number(response.headers.get("content-length"));
            if (expected > 0 && !response.headers.get("content-encoding") && expected !== bytes.length) throw transferError("The official catalog download was interrupted.", true);
            return { bytes, full: true };
          }
          if (response.status !== 206) throw transferError("The official source returned an unsupported download response.");
          const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") || "");
          if (!match) throw transferError("The official source returned an invalid download range.");
          const from = Number(match[1]), to = Number(match[2]), total = Number(match[3]);
          if (total > MAX_BYTES || from !== start || to !== Math.min(end, total - 1) || to < from) throw transferError("The official source returned an invalid download range.");
          const etag = response.headers.get("etag");
          const currentValidator = etag && !etag.startsWith("W/") ? etag : response.headers.get("last-modified");
          if (validator && currentValidator !== validator) throw transferError("The official catalog changed during download. Please retry.");
          const bytes = await readBytes(response, to - from + 1);
          if (bytes.length !== to - from + 1) throw transferError("The official catalog download was interrupted.", true);
          return { bytes, total, validator: currentValidator };
        } catch (error) {
          if (controller.signal.aborted) throw error;
          if (error.retryable === false || attempt === 1) throw error;
          // Retry this segment once, preserving the already validated segments.
        }
      }
    }
    const first = await part(0, CHUNK_BYTES - 1);
    if (!first) return null;
    if (first.full || first.bytes.length === first.total) return first.bytes.toString("utf8");
    const firstValidator = first.validator;
    if (!firstValidator) {
      // Without a version validator, avoid assembling segments from potentially
      // different revisions. Fall back to a single normal response.
      const whole = await part(0, CHUNK_BYTES - 1, undefined, false);
      if (!whole?.full) throw transferError("The official source cannot verify a segmented catalog download. Please retry.");
      return whole.bytes.toString("utf8");
    }
    const output = Buffer.alloc(first.total);
    first.bytes.copy(output);
    let cursor = first.bytes.length;
    async function worker() {
      while (!controller.signal.aborted && cursor < first.total) {
        const start = cursor;
        const end = Math.min(first.total - 1, start + CHUNK_BYTES - 1);
        cursor = end + 1;
        const next = await part(start, end, firstValidator);
        if (!next || next.total !== first.total) throw transferError("The official catalog changed during download. Please retry.");
        next.bytes.copy(output, start);
      }
    }
    // At most three streams per catalog, with one shared overall deadline.
    await Promise.all([worker(), worker(), worker()]);
    if (controller.signal.aborted) throw transferError("The official catalog download timed out. Please retry.");
    return output.toString("utf8");
  } catch (error) {
    if (controller.signal.aborted) throw new Error("The official catalog download timed out. Please retry.");
    if (error.retryable === undefined) throw new Error("The connection to the official catalog was interrupted. Please retry.");
    throw error;
  } finally {
    clearTimeout(deadline);
    controller.abort();
  }
}

module.exports = { downloadConferenceCatalog };
