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

async function extractPdfText(filePath, options = {}) {
  const stats = fs.statSync(filePath);
  if (stats.size > MAX_PDF_BYTES) {
    throw new Error(`The attached PDF is larger than ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB.`);
  }

  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const packageRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const standardFontDataUrl = pathToFileURL(`${path.join(packageRoot, "standard_fonts")}${path.sep}`).href;
  const loadingTask = getDocument({
    data: new Uint8Array(fs.readFileSync(filePath)),
    disableWorker: true,
    standardFontDataUrl,
    useSystemFonts: true,
  });

  let document;
  try {
    document = await loadingTask.promise;
    const range = normalizePageRange(options.startPage, options.endPage, document.numPages);
    const pages = [];
    let characterCount = 0;
    let textLimited = false;

    for (let pageNumber = range.start; pageNumber <= range.end; pageNumber += 1) {
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
      name: path.basename(filePath),
      size_bytes: stats.size,
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

module.exports = { extractPdfText, normalizePageRange, pageText };
