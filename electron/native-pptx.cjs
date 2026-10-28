const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createHash, randomUUID } = require("node:crypto");
const PptxGenJS = require("pptxgenjs");
const { createCanvas } = require("@napi-rs/canvas");

// This renderer deliberately owns layout. The model plans claims, evidence, and
// slide types; it never has to calculate a text box coordinate or pass a DSL checker.
const W = 13.333;
const H = 7.5;
const PAPER = "F8F4EA";
const INK = "292722";
const GREEN = "1F6652";
const OCHRE = "A56F2D";
const RED = "9E4B3E";
const MUTED = "706C63";

function clean(value, limit = 1_000) { return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit); }
function rel(workspace, filename) { return path.relative(workspace, filename).split(path.sep).join("/"); }
function limited(value, length) {
  const text = clean(value, length + 80);
  return text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;
}
function wrap(text, perLine, lines) {
  const words = clean(text, perLine * lines * 2).split(/\s+/);
  const output = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > perLine && line) { output.push(line); line = word; }
    else line = next;
    if (output.length === lines) break;
  }
  if (line && output.length < lines) output.push(line);
  const joined = output.join("\n");
  return words.join(" ").length > joined.replace(/\n/g, " ").length ? `${joined.replace(/\s*$/, "")}…` : joined;
}

function sofficePath() {
  const candidates = [process.env.ARCHIMEDES_SOFFICE, "/Applications/LibreOffice.app/Contents/MacOS/soffice", path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice"), "soffice"];
  return candidates.find((candidate) => candidate && (candidate === "soffice" || fs.existsSync(candidate))) || "soffice";
}
function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(`${path.basename(command)} failed (${code}): ${output.trim()}`)));
  });
}
async function toPdf(pptxPath, outputDir) {
  await run(sofficePath(), ["--headless", "--convert-to", "pdf", "--outdir", outputDir, pptxPath], outputDir);
  const pdfPath = path.join(outputDir, `${path.basename(pptxPath, ".pptx")}.pdf`);
  if (!fs.existsSync(pdfPath)) throw new Error("LibreOffice did not produce a PDF preview for the presentation.");
  return pdfPath;
}

function sourceCrop(source) {
  const crop = source?.crop;
  return crop && [crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) ? crop : null;
}
async function evidenceImages(pdfPath, slides, mediaDir) {
  if (!slides.some((slide) => sourceCrop(slide?.source) && ["figure", "table", "diagram"].includes(slide.source?.kind))) return new Map();
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)), useSystemFonts: true, disableFontFace: true }).promise;
  const images = new Map();
  try {
    for (let index = 0; index < slides.length; index += 1) {
      const source = slides[index]?.source;
      const crop = sourceCrop(source);
      if (!crop || !["figure", "table", "diagram"].includes(source?.kind)) continue;
      const page = await document.getPage(Math.min(document.numPages, Math.max(1, Number(source.page) || 1)));
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, 2600 / base.width, 2200 / base.height) });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const sx = Math.max(0, Math.floor(crop.x * canvas.width));
      const sy = Math.max(0, Math.floor(crop.y * canvas.height));
      const sw = Math.min(canvas.width - sx, Math.max(1, Math.ceil(crop.width * canvas.width)));
      const sh = Math.min(canvas.height - sy, Math.max(1, Math.ceil(crop.height * canvas.height)));
      const cropped = createCanvas(sw, sh);
      const context = cropped.getContext("2d");
      context.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      // Tighten PDF-page crops to their actual ink so source pages do not carry white gutters.
      const pixels = context.getImageData(0, 0, sw, sh).data;
      let left = sw; let top = sh; let right = -1; let bottom = -1;
      const stride = Math.max(1, Math.floor(Math.min(sw, sh) / 650));
      for (let y = 0; y < sh; y += stride) for (let x = 0; x < sw; x += stride) {
        const offset = (y * sw + x) * 4;
        if (pixels[offset + 3] < 24 || (pixels[offset] > 247 && pixels[offset + 1] > 247 && pixels[offset + 2] > 247)) continue;
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      const hasInk = right - left > sw * .12 && bottom - top > sh * .12;
      const padX = Math.ceil(sw * .025); const padY = Math.ceil(sh * .03);
      const tx = hasInk ? Math.max(0, left - padX) : 0;
      const ty = hasInk ? Math.max(0, top - padY) : 0;
      const tw = hasInk ? Math.min(sw - tx, right - tx + padX + 1) : sw;
      const th = hasInk ? Math.min(sh - ty, bottom - ty + padY + 1) : sh;
      const target = createCanvas(tw, th);
      target.getContext("2d").drawImage(cropped, tx, ty, tw, th, 0, 0, tw, th);
      const filename = path.join(mediaDir, `evidence-${String(index + 1).padStart(2, "0")}.png`);
      fs.writeFileSync(filename, target.toBuffer("image/png"));
      images.set(index, { path: filename, width: tw, height: th });
      page.cleanup();
    }
  } finally { await document.destroy(); }
  return images;
}

function baseDeck(paper) {
  const deck = new PptxGenJS();
  deck.layout = "LAYOUT_WIDE";
  deck.author = "Archimedes";
  deck.subject = `Paper presentation: ${paper.title}`;
  deck.title = paper.title;
  deck.company = "Archimedes";
  deck.lang = "en-US";
  deck.theme = { headFontFace: "Arial", bodyFontFace: "Arial", lang: "en-US" };
  return deck;
}
function addText(slide, text, options = {}) { slide.addText(text, { margin: 0, breakLine: false, fontFace: "Arial", color: INK, ...options }); }
function addRule(slide, y, color = "D4C8B2") { slide.addShape("line", { x: .72, y, w: 11.88, h: 0, line: { color, width: 1 } }); }
function addFooter(slide, number) { addText(slide, String(number).padStart(2, "0"), { x: .72, y: 7.05, w: .4, h: .18, fontSize: 7.5, color: MUTED, bold: true, charSpacing: 1.2 }); }
function addHeader(slide, number, section, title) {
  addText(slide, `${String(number).padStart(2, "0")} · ${String(section || "Paper").replace(/_/g, " ").toUpperCase()}`, { x: .72, y: .42, w: 3.7, h: .22, fontSize: 9, color: RED, bold: true, charSpacing: 1.4 });
  addText(slide, wrap(title, 48, 2), { x: .72, y: .78, w: 11.6, h: .9, fontSize: 26, bold: true, breakLine: false, fit: "shrink" });
  addRule(slide, 1.73);
  addFooter(slide, number);
}
function addBulletRows(slide, bullets, x, y, w, max = 3) {
  const safe = bullets.filter(Boolean).slice(0, max);
  safe.forEach((bullet, index) => {
    const top = y + index * .86;
    addText(slide, String(index + 1).padStart(2, "0"), { x, y: top + .03, w: .28, h: .2, fontSize: 9, color: RED, bold: true });
    addText(slide, wrap(bullet, Math.max(24, Math.floor(w * 7.2)), 3), { x: x + .45, y: top, w: w - .45, h: .67, fontSize: 13.5, color: INK, breakLine: false, fit: "shrink", valign: "mid" });
  });
}
function addEvidence(slide, image, x, y, w, h) {
  slide.addShape("rect", { x, y, w, h, fill: { color: "FFFDF8" }, line: { color: "D7CCB8", width: .8 } });
  if (!image) return false;
  const scale = Math.min((w - .18) / image.width, (h - .18) / image.height);
  const iw = image.width * scale; const ih = image.height * scale;
  slide.addImage({ path: image.path, x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih });
  return true;
}
function addSummaryStrip(slide, label, text) {
  slide.addShape("rect", { x: .72, y: 6.37, w: 11.88, h: .42, fill: { color: "E9E0D0" }, line: { color: "E9E0D0" } });
  addText(slide, label, { x: .92, y: 6.49, w: 1.8, h: .14, fontSize: 9.5, color: RED, bold: true });
  addText(slide, limited(text, 190), { x: 2.42, y: 6.48, w: 9.95, h: .16, fontSize: 9.5, color: INK, fit: "shrink" });
}
function addCover(slide, paper) {
  slide.background = { color: PAPER };
  slide.addShape("rect", { x: .42, y: 0, w: .13, h: H, fill: { color: GREEN }, line: { color: GREEN } });
  addText(slide, "ACADEMIC PAPER PRESENTATION", { x: 1.0, y: .8, w: 4.3, h: .2, fontSize: 9, color: RED, bold: true, charSpacing: 1.5 });
  addText(slide, wrap(paper.title, 34, 3), { x: 1.0, y: 1.36, w: 7.3, h: 1.85, fontSize: 29, bold: true, fit: "shrink" });
  addText(slide, limited(paper.abstract, 220), { x: 1.03, y: 3.48, w: 5.75, h: .72, fontSize: 13, color: MUTED, breakLine: false, fit: "shrink" });
  addRule(slide, 4.68, "B8A98E");
  addText(slide, "AUTHORS", { x: 1.0, y: 5.0, w: 1, h: .16, fontSize: 8.5, color: RED, bold: true, charSpacing: 1.1 });
  addText(slide, limited((paper.authors || []).slice(0, 5).join(", ") || "Authors unavailable", 150), { x: 1.0, y: 5.28, w: 4.8, h: .36, fontSize: 11.5 });
  addText(slide, "SOURCE", { x: 6.2, y: 5.0, w: 1, h: .16, fontSize: 8.5, color: RED, bold: true, charSpacing: 1.1 });
  addText(slide, [paper.venue, paper.year].filter(Boolean).join(" · ") || "Paper review", { x: 6.2, y: 5.28, w: 3.1, h: .36, fontSize: 11.5 });
  slide.addShape("ellipse", { x: 9.65, y: 1.15, w: 2.25, h: 2.25, line: { color: "CDBE9D", width: 1.1, transparency: 28 }, fill: { color: PAPER, transparency: 100 } });
  slide.addShape("ellipse", { x: 10.63, y: 2.35, w: 1.52, h: 1.52, line: { color: GREEN, width: 1.1, transparency: 18 }, fill: { color: PAPER, transparency: 100 } });
  addText(slide, "REVIEW\n→\nPRESENT", { x: 9.95, y: 2.08, w: 1.5, h: .72, fontSize: 13, color: GREEN, bold: true, align: "center", breakLine: false });
  addFooter(slide, 1);
}
function addProcess(slide, slideData) {
  const items = (slideData.visual?.items || []).slice(0, 4);
  const labels = items.length ? items.map((item) => item.value || item.label || item.detail) : slideData.bullets.slice(0, 4);
  const count = Math.max(2, labels.length);
  const boxW = Math.min(2.25, 10.7 / count);
  labels.forEach((label, index) => {
    const x = .88 + index * (10.7 / count);
    slide.addShape("rect", { x, y: 3.1, w: boxW, h: 1.0, fill: { color: index % 2 ? "EFE6D6" : "FDF9F0" }, line: { color: index % 2 ? OCHRE : GREEN, width: 1 } });
    addText(slide, wrap(label, 18, 3), { x: x + .16, y: 3.39, w: boxW - .32, h: .38, fontSize: 12, color: INK, bold: true, align: "center", breakLine: false, fit: "shrink" });
    if (index < labels.length - 1) addText(slide, "→", { x: x + boxW + .08, y: 3.44, w: .3, h: .2, fontSize: 18, color: OCHRE, bold: true, align: "center" });
  });
  addSummaryStrip(slide, "MECHANISM", slideData.takeaway || slideData.lead);
}
function addTextLayout(slide, slideData) {
  addText(slide, wrap(slideData.lead || slideData.takeaway, 100, 3), { x: .9, y: 2.2, w: 8.8, h: .85, fontSize: 18, color: INK, breakLine: false, fit: "shrink" });
  addBulletRows(slide, slideData.bullets, .9, 3.5, 10.8, 3);
  addSummaryStrip(slide, "TAKEAWAY", slideData.takeaway || slideData.lead);
}
function addEvidenceLayout(slide, slideData, image) {
  const hasImage = addEvidence(slide, image, .72, 2.1, 6.65, 3.78);
  if (hasImage) {
    addText(slide, wrap(slideData.lead || slideData.takeaway, 41, 3), { x: 7.84, y: 2.14, w: 4.28, h: .7, fontSize: 16.5, bold: true, breakLine: false, fit: "shrink" });
    addBulletRows(slide, slideData.bullets, 7.84, 3.1, 4.1, 3);
  } else addTextLayout(slide, slideData);
  addSummaryStrip(slide, slideData.section === "experiments" ? "EVIDENCE" : "WHY IT MATTERS", slideData.takeaway || slideData.lead);
}
function addContent(slide, number, data, image) {
  slide.background = { color: PAPER };
  addHeader(slide, number, data.section, data.title);
  if (data.layout === "process") addProcess(slide, data);
  else if (["figure-led", "split", "comparison", "metrics"].includes(data.layout) || image) addEvidenceLayout(slide, data, image);
  else addTextLayout(slide, data);
}

async function writeDeck(paper, slides, images, indices, filename) {
  const deck = baseDeck(paper);
  for (const index of indices) {
    const page = deck.addSlide();
    if (index === 0) addCover(page, paper);
    else addContent(page, index + 1, slides[index - 1], images.get(index - 1));
  }
  await deck.writeFile({ fileName: filename });
}

async function generateNativePptx({ paper, plan, workspace, sourcePdfPath, emit = () => {}, onPage = async () => {} }) {
  const hash = createHash("sha256").update(`${paper.id}\u0000${paper.title}`).digest("hex").slice(0, 16);
  const root = path.join(workspace, ".archimedes", "presentations", hash, randomUUID());
  const media = path.join(root, "media");
  const pages = path.join(root, "pages");
  fs.mkdirSync(media, { recursive: true }); fs.mkdirSync(pages, { recursive: true });
  emit("Cropping the paper's figures and tables for the native deck…");
  const images = await evidenceImages(sourcePdfPath, plan.slides, media);
  const total = plan.slides.length + 1;
  for (let index = 0; index < total; index += 1) {
    emit(`Rendering page ${index + 1} of ${total}…`);
    const pptxPath = path.join(pages, `slide-${String(index + 1).padStart(2, "0")}.pptx`);
    await writeDeck(paper, plan.slides, images, [index], pptxPath);
    const pdfPath = await toPdf(pptxPath, pages);
    await onPage({ index, total, pptxPath: rel(workspace, pptxPath), pdfPath: rel(workspace, pdfPath), validation: "rendered" });
  }
  emit("Saving the editable PowerPoint deck…");
  const pptxPath = path.join(root, "presentation.pptx");
  await writeDeck(paper, plan.slides, images, Array.from({ length: total }, (_, index) => index), pptxPath);
  const pdfPath = await toPdf(pptxPath, root);
  return { kind: "pptx", pptx_path: rel(workspace, pptxPath), pdf_path: rel(workspace, pdfPath), page_count: total, validation: "rendered", renderer: "native-pptx" };
}

module.exports = { generateNativePptx };
