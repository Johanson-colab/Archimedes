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
        resolve({ redirect: new URL(location, url).href });
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
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
      response.on("end", () => resolve({ data: Buffer.concat(chunks), contentType: String(response.headers["content-type"] || "") }));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("Remote document download timed out after 30 seconds.")));
    request.on("error", reject);
    if (signal) {
      if (signal.aborted) { request.destroy(new Error("Request interrupted.")); return; }
      signal.addEventListener("abort", () => request.destroy(new Error("Request interrupted.")), { once: true });
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
  if (!article?.content) throw new Error("No readable article text was found on this page.");
  const content = new JSDOM(article.content, { url }).window.document;
  const blocks = [...content.querySelectorAll("h1,h2,h3,h4,p,li,blockquote,pre")]
    .filter((node) => !node.parentElement?.closest("li,blockquote,pre") || ["LI", "BLOCKQUOTE", "PRE"].includes(node.tagName))
    .map((node) => node.textContent?.replace(/\s+/g, " ").trim() || "")
    .filter(Boolean);
  return { title: article.title || document.title || url, text: blocks.join("\n\n") || article.textContent.trim() };
}

async function openPublicPage(value, options = {}) {
  const result = await fetchPublicDocument(value, { signal: options.signal });
  if (!/html|xml/i.test(result.contentType) && !/^\s*(?:<!doctype html|<html)/i.test(result.data.toString("utf8", 0, 100))) {
    throw new Error("The URL did not return a readable HTML page.");
  }
  const article = pageTextFromHtml(result.data.toString("utf8"), result.url);
  const start = Math.max(0, Math.min(Number(options.startChar) || 0, article.text.length));
  const end = Math.min(article.text.length, start + 12_000);
  return { url: result.url, title: article.title, start_char: start, end_char: end, next_char: end < article.text.length ? end : null, text: article.text.slice(start, end) };
}

async function readPublicPdf(value, options = {}) {
  const { data, url } = await fetchPublicPdf(value, options.signal);
  const result = await extractPdfTextData(data, new URL(url).pathname.split("/").at(-1) || "paper.pdf", options);
  return { source_url: url, ...result };
}

module.exports = { fetchPublicPdf, isPrivateAddress, openPublicPage, pageTextFromHtml, publicHttpsUrl, readPublicPdf };
