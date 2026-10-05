const dns = require("node:dns");
const https = require("node:https");
const net = require("node:net");
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");
const { extractPdfTextData } = require("./pdf-reader.cjs");

const MAX_PDF_BYTES = 100 * 1024 * 1024;
const MAX_HTML_BYTES = 3 * 1024 * 1024;

function isPrivateAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && c === 0))) ||
      (a === 198 && (b === 18 || b === 19));
  }
  const normalized = String(address || "").toLowerCase();
  if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice(7));
  return net.isIP(normalized) !== 6 || !["2", "3"].includes(normalized[0]);
}

function publicHttpsUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error("Enter a valid public HTTPS URL."); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      url.hostname.toLowerCase() === "localhost" || url.hostname.toLowerCase().endsWith(".localhost") ||
      (net.isIP(url.hostname) && isPrivateAddress(url.hostname))) {
    throw new Error("Only public HTTPS URLs on port 443 can be opened.");
  }
  return url;
}

function requestOnce(url, maxBytes, signal) {
  return new Promise((resolve, reject) => {
    let abortListener;
    const cleanup = () => { if (signal && abortListener) signal.removeEventListener("abort", abortListener); };
    const request = https.request(url, {
      method: "GET",
      headers: { Accept: "text/html,application/pdf;q=0.9" },
      timeout: 30_000,
      lookup(hostname, options, callback) {
        dns.lookup(hostname, options, (error, address, family) => {
          if (error) return callback(error);
          const addresses = Array.isArray(address) ? address.map((entry) => entry.address) : [address];
          if (!addresses.length || addresses.some(isPrivateAddress)) return callback(new Error("Private network destinations are blocked."));
          if (Array.isArray(address)) callback(null, address);
          else callback(null, address, family);
        });
      },
    }, (response) => {
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && location) {
        response.resume();
        cleanup();
        resolve({ redirect: new URL(location, url).href });
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        cleanup();
        reject(new Error(`Page download failed (${response.statusCode}).`));
        return;
      }
      const declaredSize = Number(response.headers["content-length"] || 0);
      if (declaredSize > maxBytes) {
        response.destroy(new Error("The remote document is too large."));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) response.destroy(new Error("The remote document is too large."));
        else chunks.push(chunk);
      });
      response.on("end", () => { cleanup(); resolve({ data: Buffer.concat(chunks), contentType: String(response.headers["content-type"] || "") }); });
      response.on("error", (error) => { cleanup(); reject(error); });
    });
    request.on("timeout", () => request.destroy(new Error("Remote document download timed out after 30 seconds.")));
    request.on("error", (error) => { cleanup(); reject(error); });
    if (signal) {
      if (signal.aborted) { request.destroy(new Error("Request interrupted.")); return; }
      abortListener = () => request.destroy(new Error("Request interrupted."));
      signal.addEventListener("abort", abortListener, { once: true });
    }
    request.end();
  });
}

async function fetchPublicDocument(value, { maxBytes = MAX_HTML_BYTES, signal } = {}) {
  let url = publicHttpsUrl(value);
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    const result = await requestOnce(url, maxBytes, signal);
    if (!result.redirect) return { ...result, url: url.href };
    url = publicHttpsUrl(result.redirect);
  }
  throw new Error("The remote document redirected too many times.");
}

async function fetchPublicPdf(value, signal) {
  const result = await fetchPublicDocument(value, { maxBytes: MAX_PDF_BYTES, signal });
  if (result.data.subarray(0, 4).toString("ascii") !== "%PDF") throw new Error("The paper URL did not return a PDF document.");
  return result;
}

function pageTextFromHtml(html, url) {
  const document = new JSDOM(html, { url }).window.document;
  const article = new Readability(document).parse();
  const content = article?.content
    ? new JSDOM(article.content, { url }).window.document
    : new JSDOM(html, { url }).window.document;
  if (!article?.content) content.querySelectorAll("script,style,nav,header,footer,aside,form,svg").forEach((node) => node.remove());
  const root = article?.content ? content : content.querySelector("main,article") || content.body;
  const blocks = [...root.querySelectorAll("h1,h2,h3,h4,p,li,blockquote,pre")]
    .filter((node) => !node.parentElement?.closest("li,blockquote,pre") || ["LI", "BLOCKQUOTE", "PRE"].includes(node.tagName))
    .map((node) => node.textContent?.replace(/\s+/g, " ").trim() || "")
    .filter(Boolean);
  const text = blocks.join("\n\n") || (root.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("No readable text was found on this page.");
  return { title: article?.title || content.title || url, text };
}

async function openPublicPage(value, options = {}) {
  const result = await fetchPublicDocument(value, { signal: options.signal });
  if (!/html|xml/i.test(result.contentType) && !/^\s*(?:<!doctype html|<html)/i.test(result.data.toString("utf8", 0, 100))) {
    throw new Error("The URL did not return a readable HTML page.");
  }
  const article = pageTextFromHtml(result.data.toString("utf8"), result.url);
  const start = Math.max(0, Math.min(Number(options.startChar) || 0, article.text.length));
  const end = Math.min(article.text.length, start + 12_000);
  return { url: result.url, title: article.title, start_char: start, end_char: end, next_char: end < article.text.length ? end : null, text: article.text.slice(start, end), retrieved_at: new Date().toISOString() };
}

function findInText(text, query, { maxMatches = 8, contextChars = 180 } = {}) {
  const needle = String(query || "").trim();
  if (!needle || needle.length > 200) throw new Error("Find requires text of at most 200 characters.");
  const matches = [];
  const lowerText = text.toLocaleLowerCase();
  const lowerNeedle = needle.toLocaleLowerCase();
  let cursor = 0;
  let total = 0;
  while (cursor < text.length) {
    const position = lowerText.indexOf(lowerNeedle, cursor);
    if (position < 0) break;
    total += 1;
    if (matches.length < maxMatches) matches.push({
      start_char: position,
      excerpt: text.slice(Math.max(0, position - contextChars), Math.min(text.length, position + needle.length + contextChars)),
    });
    cursor = position + Math.max(needle.length, 1);
  }
  return { query: needle, match_count: total, matches };
}

async function findPublicPage(value, query, options = {}) {
  const result = await fetchPublicDocument(value, { signal: options.signal });
  if (!/html|xml/i.test(result.contentType) && !/^\s*(?:<!doctype html|<html)/i.test(result.data.toString("utf8", 0, 100))) {
    throw new Error("The URL did not return a readable HTML page.");
  }
  const article = pageTextFromHtml(result.data.toString("utf8"), result.url);
  return { url: result.url, title: article.title, retrieved_at: new Date().toISOString(), ...findInText(article.text, query) };
}

async function readPublicPdf(value, options = {}) {
  const { data, url } = await fetchPublicPdf(value, options.signal);
  const result = await extractPdfTextData(data, new URL(url).pathname.split("/").at(-1) || "paper.pdf", options);
  return { source_url: url, ...result };
}

module.exports = { fetchPublicPdf, findInText, findPublicPage, isPrivateAddress, openPublicPage, pageTextFromHtml, publicHttpsUrl, readPublicPdf };
