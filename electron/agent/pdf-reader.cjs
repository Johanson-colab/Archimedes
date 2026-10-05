const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const MAX_PDF_BYTES = 100 * 1024 * 1024;
const MAX_PAGES_PER_READ = 24;
const MAX_TEXT_CHARS = 40_000;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePageRange(startPage, endPage, pageCount) {
  const start = Math.min(positiveInteger(startPage, 1), pageCount);
  const requestedEnd = Math.min(positiveInteger(endPage, start + MAX_PAGES_PER_READ - 1), pageCount);
  const end = Math.max(start, Math.min(requestedEnd, start + MAX_PAGES_PER_READ - 1));
  return { start, end, rangeLimited: requestedEnd > end };
}

function pageText(items) {
  let output = "";
  let previousY = null;
  for (const item of items) {
    const text = typeof item?.str === "string" ? item.str.trim() : "";
    if (!text) continue;
    const y = Array.isArray(item.transform) ? Number(item.transform[5]) : previousY;
    const newLine = previousY !== null && Number.isFinite(y) && Math.abs(y - previousY) > 2;
    if (output) output += newLine ? "\n" : " ";
    output += text;
    if (item.hasEOL) output += "\n";
    if (Number.isFinite(y)) previousY = y;
  }
  return output.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function loadPdf(data) {
  if (data.byteLength > MAX_PDF_BYTES) {
    throw new Error(`The attached PDF is larger than ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB.`);
  }
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const packageRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const standardFontDataUrl = pathToFileURL(`${path.join(packageRoot, "standard_fonts")}${path.sep}`).href;
  return getDocument({
    data: new Uint8Array(data),
    disableWorker: true,
    standardFontDataUrl,
    useSystemFonts: true,
  });
}

async function extractPdfTextData(data, name, options = {}) {
  const loadingTask = await loadPdf(data);
  let document;
  try {
    document = await loadingTask.promise;
    const range = normalizePageRange(options.startPage, options.endPage, document.numPages);
    const pages = [];
    let characterCount = 0;
    let textLimited = false;

    for (let pageNumber = range.start; pageNumber <= range.end; pageNumber += 1) {
      if (options.signal?.aborted) throw new Error("PDF reading was interrupted.");
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = pageText(content.items);
      const remaining = MAX_TEXT_CHARS - characterCount;
      if (text.length > remaining) {
        text = text.slice(0, Math.max(0, remaining));
        textLimited = true;
      }
      pages.push({ page: pageNumber, text });
      characterCount += text.length;
      page.cleanup();
      if (textLimited || characterCount >= MAX_TEXT_CHARS) break;
    }

    const lastPage = pages.at(-1)?.page || range.start;
    const hasExtractedText = pages.some((page) => page.text.trim());
    return {
      kind: "pdf",
      name,
      size_bytes: data.byteLength,
      page_count: document.numPages,
      start_page: range.start,
      end_page: lastPage,
      pages,
      has_more: lastPage < document.numPages,
      next_page: lastPage < document.numPages ? lastPage + 1 : null,
      truncated: range.rangeLimited || textLimited,
      warning: hasExtractedText ? "" : "No selectable text was found in this page range. The PDF may require OCR.",
    };
  } catch (error) {
    if (error?.name === "PasswordException") throw new Error("The attached PDF is password-protected and cannot be parsed.");
    throw new Error(`PDF text extraction failed: ${error?.message || String(error)}`);
  } finally {
    if (document) await document.destroy();
    else await loadingTask.destroy();
  }
}

async function findPdfTextData(data, name, query, options = {}) {
  const needle = String(query || "").trim();
  if (!needle || needle.length > 200) throw new Error("PDF find requires text of at most 200 characters.");
  const loadingTask = await loadPdf(data);
  let document;
  try {
    document = await loadingTask.promise;
    const limit = Math.min(document.numPages, Math.max(1, Math.min(Number(options.maxPages) || 120, 120)));
    const matches = [];
    let matchCount = 0;
    let hasText = false;
    for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
      if (options.signal?.aborted) throw new Error("PDF search was interrupted.");
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = pageText(content.items).replace(/\s+/g, " ");
      if (text) hasText = true;
      const lower = text.toLocaleLowerCase();
      const target = needle.toLocaleLowerCase();
      let position = 0;
      while ((position = lower.indexOf(target, position)) !== -1) {
        matchCount += 1;
        if (matches.length < 12) matches.push({ page: pageNumber,
          excerpt: text.slice(Math.max(0, position - 180), Math.min(text.length, position + needle.length + 180)),
        });
        position += Math.max(target.length, 1);
      }
      page.cleanup();
    }
    return { kind: "pdf_find", name, page_count: document.numPages, scanned_pages: limit,
      query: needle, match_count: matchCount, matches, truncated: limit < document.numPages,
      warning: hasText ? "" : "No selectable text was found. This PDF may need OCR or vision reading.",
    };
  } finally {
    if (document) await document.destroy();
    else await loadingTask.destroy();
  }
}

async function renderPdfPageData(data, name, pageNumber, options = {}) {
  const loadingTask = await loadPdf(data);
  let document;
  try {
    document = await loadingTask.promise;
    const number = Number(pageNumber);
    if (!Number.isInteger(number) || number < 1 || number > document.numPages) {
      throw new Error(`Choose a PDF page from 1 to ${document.numPages}.`);
    }
    const page = await document.getPage(number);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1600 / base.width, 2200 / base.height);
    const viewport = page.getViewport({ scale });
    const { createCanvas } = require("@napi-rs/canvas");
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext("2d"), viewport, canvas }).promise;
    page.cleanup();
    return { kind: "pdf_page_image", name, page: number, page_count: document.numPages,
      mime_type: "image/png", data: canvas.toBuffer("image/png"),
    };
  } finally {
    if (document) await document.destroy();
    else await loadingTask.destroy();
  }
}

async function extractPdfText(filePath, options = {}) {
  const stats = fs.statSync(filePath);
  return extractPdfTextData(fs.readFileSync(filePath), path.basename(filePath), options);
}

module.exports = { extractPdfText, extractPdfTextData, findPdfTextData, normalizePageRange, pageText, renderPdfPageData };
