const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { fetchPublicPdf } = require("./agent/remote-content.cjs");
const { extractPdfPagesData } = require("./agent/pdf-reader.cjs");

function inferredPdfUrl(paper) {
  if (paper.pdf_url) return paper.pdf_url;
  const arxivId = String(paper.arxiv_id || "").trim();
  if (arxivId) return `https://arxiv.org/pdf/${arxivId}`;
  const match = String(paper.url || "").match(/arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i);
  return match ? `https://arxiv.org/pdf/${match[1]}` : "";
}

async function preparePaperReader({ workspace, paper, localPath = "" }) {
  let data;
  let sourceUrl = inferredPdfUrl(paper);
  let name = `${paper.id}.pdf`;
  if (localPath) {
    const stat = fs.statSync(localPath);
    if (!stat.isFile()) throw new Error("Choose a PDF file to attach.");
    if (stat.size > 100 * 1024 * 1024) throw new Error("The PDF is larger than the 100 MB library limit.");
    data = fs.readFileSync(localPath);
    name = path.basename(localPath);
    sourceUrl = "";
  } else {
    if (!sourceUrl) throw new Error("No public PDF URL is available. Attach a local PDF to read the full text.");
    const result = await fetchPublicPdf(sourceUrl);
    data = result.data;
    sourceUrl = result.url;
    name = new URL(result.url).pathname.split("/").filter(Boolean).at(-1) || name;
  }
  if (data.subarray(0, 4).toString("ascii") !== "%PDF") throw new Error("The selected source did not contain a PDF document.");
  const index = await extractPdfPagesData(data, name);
  const relativePath = `.archimedes/papers/${paper.id}.pdf`;
  const outputPath = path.join(workspace, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, data);
  fs.renameSync(temporaryPath, outputPath);
  return { source_url: sourceUrl, relative_path: relativePath, sha256: createHash("sha256").update(data).digest("hex"),
    size_bytes: data.length, page_count: index.page_count, pages: index.pages, truncated: index.truncated, warning: index.warning };
}

module.exports = { inferredPdfUrl, preparePaperReader };
