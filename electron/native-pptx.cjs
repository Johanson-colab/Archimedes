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
// Palette and geometry follow the supplied MemT-1.0 lab-meeting deck.
const PAPER = "F7F4EC";
const INK = "24262A";
const GREEN = "1E5B4B";
const OCHRE = "B5742A";
const MUTED = "7E7A6E";
const RULE = "D8D1BE";
// Use a family that handles the language being rendered.  A single CJK fallback
// for every text run made English width calculations unreliable and caused words
// to break in the middle in the preview.
const CJK_FONT = process.platform === "win32" ? "Microsoft YaHei" : process.platform === "darwin" ? "PingFang SC" : "Noto Sans CJK SC";
const LATIN_FONT = "Arial";
const LATIN_TITLE_FONT = "Georgia";

function clean(value, limit = 1_000) { return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit); }
function rel(workspace, filename) { return path.relative(workspace, filename).split(path.sep).join("/"); }
function limited(value, length) {
  const text = clean(value, length + 80);
  if (text.length <= length) return text;
  const sentence = text.slice(0, length + 1).match(/^([\s\S]*[.!?。！？])\s*/)?.[1]?.trim();
  return sentence && sentence.length >= Math.floor(length * .55)
    ? sentence
    : text.slice(0, length + 1).replace(/\s+\S*$/, "").trimEnd();
}
function wrap(text, perLine, lines) {
  const source = clean(text);
  const output = [];
  let line = "";
  let used = 0;
  const isCjk = (value) => /^[\u2e80-\uffff]$/u.test(value);
  const unitWidth = (value) => [...value].reduce((total, character) => total + (isCjk(character) ? 2 : 1), 0);
  const tokens = source.match(/[\u2e80-\uffff]|[^\s\u2e80-\uffff]+/gu) || [];
  for (const token of tokens) {
    const width = unitWidth(token);
    const gap = line && !isCjk(token) ? 1 : 0;
    if (line && used + gap + width > perLine) {
      output.push(line.trim());
      line = "";
      used = 0;
    }
    if (line && gap) {
      line += " ";
      used += gap;
    }
    // Latin words stay intact even when they exceed a nominal line budget.
    // The text box can shrink slightly; a split word cannot be read naturally.
    line += token;
    used += width;
  }
  if (line) output.push(line.trim());
  return output.join("\n").trim();
}

function sofficePath() {
  const candidates = [process.env.ARCHIMEDES_SOFFICE, "/Applications/LibreOffice.app/Contents/MacOS/soffice", path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice"), "soffice"];
  return candidates.find((candidate) => candidate && (candidate === "soffice" || fs.existsSync(candidate))) || "soffice";
}
function run(command, args, cwd, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(`${path.basename(command)} failed (${code}): ${output.trim()}`)));
  });
}
async function toPdf(pptxPath, outputDir, fontConfigPath) {
  const env = fontConfigPath ? { ...process.env, FONTCONFIG_FILE: fontConfigPath } : process.env;
  await run(sofficePath(), ["--headless", "--convert-to", "pdf", "--outdir", outputDir, pptxPath], outputDir, env);
  const pdfPath = path.join(outputDir, `${path.basename(pptxPath, ".pptx")}.pdf`);
  if (!fs.existsSync(pdfPath)) throw new Error("LibreOffice did not produce a PDF preview for the presentation.");
  return pdfPath;
}
function fontConfigForPreview() {
  if (process.platform !== "darwin" || process.env.FONTCONFIG_FILE) return null;
  // The bundled LibreOffice misses macOS Supplemental fonts by default. Without
  // this directory it renders Chinese as empty squares in the PDF preview.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-pptx-fonts-"));
  const fontConfigPath = path.join(directory, "fonts.conf");
  const fontDirs = ["/System/Library/Fonts", "/System/Library/Fonts/Supplemental", "/Library/Fonts", path.join(os.homedir(), "Library/Fonts")];
  const xml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  fs.writeFileSync(fontConfigPath, `<?xml version="1.0"?><fontconfig>${fontDirs.map((dir) => `<dir>${xml(dir)}</dir>`).join("")}<cachedir>${xml(path.join(directory, "cache"))}</cachedir></fontconfig>`);
  return { directory, fontConfigPath };
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
  deck.theme = { headFontFace: CJK_FONT, bodyFontFace: CJK_FONT, lang: "zh-CN" };
  return deck;
}
function addText(slide, value, options = {}) {
  const text = String(value || "");
  const title = options.fontRole === "title";
  const fontFace = options.fontFace || (isChinese(text) ? CJK_FONT : title ? LATIN_TITLE_FONT : LATIN_FONT);
  slide.addText(text, { margin: 0, breakLine: false, fontFace, color: INK, valign: "top", fit: "shrink", ...options });
}
function line(slide, x, y, w, color = RULE, width = .8) {
  slide.addShape("line", { x, y, w, h: 0, line: { color, width } });
}
function label(slide, value, x, y, w, options = {}) {
  addText(slide, value, { x, y, w, h: .23, fontSize: 10.5, color: GREEN, bold: true, ...options });
}
function isChinese(value) { return /[\u3400-\u9fff]/u.test(String(value || "")); }
function itemText(data, item) {
  return [item?.label, item?.value, item?.detail].filter(Boolean).join(isChinese(data?.title) ? "：" : ": ");
}
const SECTION_MARKERS = {
  background: ["01", "研究背景与动机", "Background"],
  related_work: ["02", "相关工作", "Related work"],
  method: ["03", "方法与架构", "Method"],
  experiments: ["04", "评测结果", "Results"],
  limitations: ["05", "局限与讨论", "Discussion"],
};
function addFooter(slide, number, source) {
  line(slide, .7, 6.96, 11.95);
  addText(slide, String(number).padStart(2, "0"), { x: 12.15, y: 7.07, w: .45, h: .18, fontSize: 8.5, color: MUTED, align: "right" });
}
function addHeader(slide, number, data, closing = false) {
  const marker = SECTION_MARKERS[data.section] || ["", "论文解读", "Paper"];
  const section = isChinese(data.title) ? marker[1] : marker[2];
  label(slide, `${marker[0]}  ·  ${section}`, .7, .46, 6, { charSpacing: 1.3 });
  const title = wrap(data.title, 70, 2);
  addText(slide, title, { x: .7, y: title.includes("\n") ? .7 : .8, w: 11.95,
    h: title.includes("\n") ? .84 : .56, fontSize: title.includes("\n") ? 23 : 27, bold: true, fontRole: "title" });
  line(slide, .7, 1.58, 11.95);
  if (!closing) addFooter(slide, number, data.source);
}
function addBullets(slide, bullets, x, y, w, rowHeight = .74, max = 5, fontSize = 14) {
  bullets.filter(Boolean).slice(0, max).forEach((bullet, index) => {
    const top = y + index * rowHeight;
    const text = wrap(bullet, Math.floor((w - .28) * 12.4), 3);
    const lines = Math.max(1, text.split("\n").length);
    const size = Math.max(11.2, Math.min(fontSize, ((rowHeight - .08) * 72) / (lines * 1.16)));
    addText(slide, "·", { x, y: top, w: .2, h: .24, fontSize: 18, color: OCHRE, bold: true });
    addText(slide, text, { x: x + .28, y: top + .015, w: w - .28, h: rowHeight - .08, fontSize: size, breakLine: false });
  });
}
function addEvidence(slide, image, x, y, w, h) {
  if (!image) return false;
  const scale = Math.min((w - .06) / image.width, (h - .06) / image.height);
  const iw = image.width * scale; const ih = image.height * scale;
  slide.addImage({ path: image.path, x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih });
  return true;
}
function takeaway(slide, text, x = .7, y = 6.52, w = 11.9) {
  if (!text) return;
  line(slide, x, y - .1, Math.min(w, 1.1), OCHRE, 2);
  const value = wrap(limited(text, 110), Math.floor(w * 12), 2);
  const lines = Math.max(1, value.split("\n").length);
  addText(slide, value, { x, y, w, h: lines > 1 ? .46 : .28, fontSize: lines > 1 ? 11.4 : 12.5, bold: true, color: GREEN });
}
function addCover(slide, paper, image) {
  slide.background = { color: PAPER };
  slide.addShape("rect", { x: 0, y: 0, w: 4.23, h: H, fill: { color: GREEN }, line: { color: GREEN } });
  slide.addShape("rect", { x: 4.23, y: 0, w: .08, h: H, fill: { color: OCHRE }, line: { color: OCHRE } });
  addText(slide, isChinese(paper.title) ? "组 会  ·  论 文 分 享" : "LAB MEETING  ·  PAPER REVIEW", { x: .53, y: .72, w: 3.2, h: .3, fontSize: 12, color: "FFFFFF", bold: true, charSpacing: 1.3 });
  line(slide, .53, 1.13, .65, OCHRE, 2);
  addText(slide, limited((paper.authors || []).slice(0, 6).join(", "), 95), { x: .53, y: 5.97, w: 3.2, h: .38, fontSize: 11.5, color: "FFFFFF" });
  addText(slide, [paper.venue, paper.year].filter(Boolean).join(" · "), { x: .53, y: 6.42, w: 3.2, h: .26, fontSize: 10.5, color: "CFE0D8" });
  addText(slide, wrap(paper.title, 45, 4), { x: 4.85, y: 1.25, w: 7.8, h: 2.15, fontSize: 31, bold: true, fontRole: "title" });
  line(slide, 4.85, 3.6, 1.7, OCHRE, 2.2);
  addText(slide, wrap(paper.abstract, 120, image ? 2 : 4), { x: 4.85, y: 3.84, w: 7.55, h: image ? .58 : 1.12, fontSize: 14.5 });
  if (image) addEvidence(slide, image, 5.2, 4.62, 6.95, 2.17);
  else {
    line(slide, 4.85, 5.53, 7.8);
    label(slide, isChinese(paper.title) ? "论文分享" : "PAPER REVIEW", 4.85, 5.78, 2.5);
  }
  addText(slide, "01", { x: 12.16, y: 7.08, w: .45, h: .18, fontSize: 8.5, color: MUTED, align: "right" });
}
function addAgenda(slide, data) {
  const items = (data.visual?.items || []).slice(0, 5);
  const rows = items.length ? items : data.bullets.slice(0, 5).map((value) => ({ label: value }));
  rows.forEach((item, index) => {
    const top = 1.82 + index * .83;
    addText(slide, String(index + 1).padStart(2, "0"), { x: .7, y: top + .02, w: .42, h: .28, fontSize: 15.5, color: OCHRE, bold: true });
    addText(slide, limited(item.label || item.value, 55), { x: 1.16, y: top, w: 6.6, h: .35, fontSize: 17.5, bold: true });
    if (item.detail) addText(slide, limited(item.detail, 85), { x: 1.16, y: top + .37, w: 6.6, h: .27, fontSize: 11.5, color: MUTED });
  });
  slide.addShape("line", { x: 8.46, y: 1.82, w: 0, h: 4.38, line: { color: GREEN, width: 1.5 } });
  label(slide, isChinese(data.title) ? "核心命题" : "CORE QUESTION", 8.78, 2.1, 3.5);
  addText(slide, wrap(data.lead || data.takeaway, 40, 7), { x: 8.78, y: 2.65, w: 3.45, h: 2.75, fontSize: 16.5 });
}
function addEditorial(slide, data) {
  if (data.lead) addText(slide, wrap(data.lead, 138, 2), { x: .7, y: 1.74, w: 11.8, h: .66, fontSize: 16.5 });
  const items = (data.visual?.items || []).slice(0, 3);
  const first = data.bullets.slice(0, items.length ? 3 : Math.ceil(data.bullets.length / 2));
  const second = items.length ? items.map((item) => itemText(data, item)) : data.bullets.slice(first.length);
  label(slide, isChinese(data.title) ? "要点" : "KEY POINTS", .7, 2.62, 5.7);
  addBullets(slide, first, .7, 3.02, 5.55, .88, 4, 14.2);
  slide.addShape("line", { x: 6.66, y: 2.6, w: 0, h: 3.46, line: { color: RULE, width: 1 } });
  label(slide, isChinese(data.title) ? "解释与证据" : "EXPLANATION", 7.02, 2.62, 5.2);
  addBullets(slide, second, 7.02, 3.02, 5.1, .88, 4, 14.2);
  takeaway(slide, data.takeaway);
}
function addFigureLed(slide, data, image, balanced = false) {
  if (!image) return addEditorial(slide, data);
  const imageW = balanced ? 6.15 : 8.1;
  const sideX = balanced ? 7.22 : 9.15;
  const sideW = balanced ? 5.1 : 3.35;
  addEvidence(slide, image, .7, 1.79, imageW, 4.46);
  label(slide, isChinese(data.title) ? "论文证据" : "EVIDENCE", sideX, 1.86, sideW);
  addText(slide, wrap(data.lead || data.takeaway, Math.floor(sideW * 13), 3), { x: sideX, y: 2.24, w: sideW, h: 1.12, fontSize: 16.2, bold: true });
  addBullets(slide, data.bullets, sideX, 3.5, sideW, balanced ? .72 : .85, balanced ? 4 : 3, balanced ? 14 : 13.2);
}
function addProcess(slide, data) {
  if (data.lead) addText(slide, wrap(data.lead, 136, 2), { x: .7, y: 1.74, w: 11.8, h: .68, fontSize: 16.2 });
  const items = (data.visual?.items || []).slice(0, 5);
  const stages = items.length ? items : data.bullets.slice(0, 5).map((bullet) => ({ label: bullet }));
  const count = Math.max(1, stages.length);
  const step = 11.65 / count;
  line(slide, .92, 3.14, 11.4, RULE, 1.1);
  stages.forEach((item, index) => {
    const x = .76 + index * step;
    slide.addShape("ellipse", { x: x + .15, y: 3.04, w: .2, h: .2, fill: { color: OCHRE }, line: { color: OCHRE } });
    addText(slide, String(index + 1).padStart(2, "0"), { x, y: 2.65, w: .48, h: .25, fontSize: 13, color: OCHRE, bold: true });
    addText(slide, wrap(item.label || item.value, Math.max(15, Math.floor(step * 12)), 3), { x, y: 3.45, w: step - .2, h: .9, fontSize: 16, color: GREEN, bold: true });
    addText(slide, wrap(item.detail || item.value, Math.max(16, Math.floor(step * 13)), 4), { x, y: 4.46, w: step - .2, h: 1.12, fontSize: 12.5 });
  });
  takeaway(slide, data.takeaway);
}
function addComparison(slide, data, image) {
  if (data.lead) addText(slide, wrap(data.lead, 135, 2), { x: .7, y: 1.75, w: 11.8, h: .66, fontSize: 15.8 });
  const items = (data.visual?.items || []).slice(0, 5);
  if (image) {
    addEvidence(slide, image, .7, 2.55, 6.5, 3.52);
    label(slide, isChinese(data.title) ? "比较结果" : "COMPARISON", 7.55, 2.58, 4.8);
    addBullets(slide, data.bullets.length ? data.bullets : items.map((item) => itemText(data, item)), 7.55, 3.02, 4.8, .73, 4, 13.8);
  } else {
    line(slide, .7, 2.84, 11.9, GREEN, 1.1);
    items.forEach((item, index) => {
      const y = 2.96 + index * .63;
      addText(slide, limited(item.label, 60), { x: .8, y, w: 3.1, h: .48, fontSize: 14, bold: true });
      addText(slide, limited(item.value, 80), { x: 4.1, y, w: 3.2, h: .48, fontSize: 14, color: GREEN });
      addText(slide, limited(item.detail, 130), { x: 7.45, y, w: 4.9, h: .48, fontSize: 12.8 });
      line(slide, .7, y + .54, 11.9);
    });
    if (!items.length) addBullets(slide, data.bullets, .7, 3.0, 11.5, .65, 5, 14.5);
  }
  takeaway(slide, data.takeaway);
}
function addMetrics(slide, data, image) {
  const items = (data.visual?.items || []).filter((item) => item.value).slice(0, 3);
  if (image) {
    addEvidence(slide, image, .7, 1.78, 7.45, 4.52);
    label(slide, isChinese(data.title) ? "关键结果" : "KEY RESULTS", 8.58, 1.83, 3.7);
    items.forEach((item, index) => {
      const y = 2.25 + index * 1.3;
      addText(slide, limited(item.value, 28), { x: 8.58, y, w: 3.7, h: .59, fontSize: 27, color: OCHRE, bold: true });
      addText(slide, wrap([item.label, item.detail].filter(Boolean).join(" · "), 45, 3), { x: 8.58, y: y + .62, w: 3.7, h: .57, fontSize: 11.5, color: MUTED });
    });
    if (!items.length) addBullets(slide, data.bullets, 8.58, 2.4, 3.7, 1.0, 3, 13.2);
  } else {
    items.forEach((item, index) => {
      const x = .72 + index * 4.05;
      addText(slide, limited(item.value, 32), { x, y: 2.12, w: 3.7, h: .8, fontSize: 34, color: OCHRE, bold: true });
      addText(slide, wrap([item.label, item.detail].filter(Boolean).join(" · "), 54, 3), { x, y: 3.02, w: 3.7, h: .75, fontSize: 13.5 });
    });
    line(slide, .7, 4.15, 11.9);
    addBullets(slide, data.bullets, .7, 4.46, 11.7, .52, 4, 13.5);
  }
}
function addTableLed(slide, data, image) {
  if (!image) return addComparison(slide, data);
  const items = (data.visual?.items || []).filter((item) => item.label || item.value || item.detail).slice(0, 3);
  addEvidence(slide, image, .7, 1.86, 7.62, 4.62);
  label(slide, isChinese(data.title) ? "结果解读" : "RESULT READING", 8.72, 1.9, 3.2);
  addText(slide, wrap(data.lead || data.takeaway, 43, 3), { x: 8.72, y: 2.27, w: 3.35, h: 1.04, fontSize: 16, bold: true });
  const source = items.length ? items : data.bullets.slice(0, 3).map((value, index) => ({ label: String(index + 1).padStart(2, "0"), detail: value }));
  source.forEach((item, index) => {
    const y = 3.62 + index * .82;
    line(slide, 8.72, y - .12, 3.18, index === 0 ? OCHRE : RULE, index === 0 ? 1.6 : .8);
    if (item.value) addText(slide, limited(item.value, 28), { x: 8.72, y, w: .86, h: .32, fontSize: 17, bold: true, color: OCHRE });
    addText(slide, wrap([item.label, item.detail].filter(Boolean).join(" "), item.value ? 31 : 39, 2), { x: item.value ? 9.68 : 8.72, y: y + .01, w: item.value ? 2.22 : 3.18, h: .58, fontSize: 11.8 });
  });
  takeaway(slide, data.takeaway);
}
function addEvidencePair(slide, data, image) {
  if (!image) return addEditorial(slide, data);
  addEvidence(slide, image, .7, 1.9, 5.55, 4.65);
  const items = (data.visual?.items || []).slice(0, 2);
  addText(slide, wrap(data.lead || data.takeaway, 66, 3), { x: 6.75, y: 1.98, w: 5.55, h: 1.02, fontSize: 17, bold: true });
  (items.length ? items : data.bullets.slice(0, 2).map((detail, index) => ({ label: String(index + 1).padStart(2, "0"), detail }))).forEach((item, index) => {
    const y = 3.4 + index * 1.14;
    addText(slide, String(index + 1).padStart(2, "0"), { x: 6.75, y, w: .42, h: .25, fontSize: 13, color: OCHRE, bold: true });
    addText(slide, limited(item.label || item.value, 48), { x: 7.25, y: y - .01, w: 4.95, h: .3, fontSize: 15.2, color: GREEN, bold: true });
    addText(slide, wrap(item.detail || item.value, 65, 2), { x: 7.25, y: y + .37, w: 4.95, h: .52, fontSize: 12.4 });
  });
  takeaway(slide, data.takeaway);
}
function addBoundaries(slide, data, closing, number, total) {
  label(slide, isChinese(data.title) ? "本文回答了什么" : "WHAT THE PAPER SHOWS", .7, 1.78, 5.9);
  addText(slide, wrap(data.lead || data.takeaway, 67, 4), { x: .7, y: 2.21, w: 5.7, h: 1.42, fontSize: 16.3, bold: true });
  addBullets(slide, data.bullets.slice(0, 2), .7, 3.82, 5.65, .91, 2, 14);
  slide.addShape("line", { x: 6.67, y: 1.78, w: 0, h: 4.45, line: { color: RULE, width: 1 } });
  label(slide, isChinese(data.title) ? "局限与讨论" : "LIMITS AND DISCUSSION", 7.04, 1.78, 5.1);
  const limits = (data.visual?.items || []).map((item) => itemText(data, item));
  addBullets(slide, limits.length ? limits : data.bullets.slice(2), 7.04, 2.3, 5.18, .91, 4, 13.8);
  if (closing) {
    slide.addShape("rect", { x: 0, y: 6.62, w: W, h: .88, fill: { color: GREEN }, line: { color: GREEN } });
    addText(slide, isChinese(data.title) ? "谢谢聆听，欢迎讨论" : "Thank you · Discussion", { x: .7, y: 6.92, w: 9.5, h: .36, fontSize: 19, color: "FFFFFF", bold: true });
    addText(slide, `${number} / ${total}`, { x: 11.75, y: 7.06, w: .83, h: .18, fontSize: 9.5, color: "CFE0D8", align: "right" });
  } else takeaway(slide, data.takeaway);
}
function addClosing(slide, data, number, total) {
  const items = (data.visual?.items || []).slice(0, 3);
  label(slide, isChinese(data.title) ? "结论" : "CONCLUSION", .7, 1.84, 5.5);
  addText(slide, wrap(data.lead || data.takeaway, 78, 3), { x: .7, y: 2.24, w: 6.55, h: 1.06, fontSize: 20, bold: true, fontRole: "title" });
  line(slide, .7, 3.72, 11.9, GREEN, 1.15);
  const conclusions = items.length ? items : data.bullets.slice(0, 3).map((detail, index) => ({ label: String(index + 1).padStart(2, "0"), detail }));
  conclusions.forEach((item, index) => {
    const x = .7 + index * 4.05;
    addText(slide, String(index + 1).padStart(2, "0"), { x, y: 4.08, w: .45, h: .22, fontSize: 12.5, color: OCHRE, bold: true });
    addText(slide, limited(item.label || item.value, 42), { x, y: 4.44, w: 3.45, h: .33, fontSize: 16, color: GREEN, bold: true });
    addText(slide, wrap(item.detail || item.value, 42, 3), { x, y: 4.86, w: 3.45, h: .8, fontSize: 12.2 });
  });
  slide.addShape("rect", { x: 0, y: 6.62, w: W, h: .88, fill: { color: GREEN }, line: { color: GREEN } });
  addText(slide, isChinese(data.title) ? "讨论" : "Discussion", { x: .7, y: 6.91, w: 7.5, h: .3, fontSize: 18, color: "FFFFFF", bold: true });
  addText(slide, `${number} / ${total}`, { x: 11.75, y: 7.06, w: .83, h: .18, fontSize: 9.5, color: "CFE0D8", align: "right" });
}
function addContent(slide, number, data, image, total) {
  slide.background = { color: PAPER };
  const closing = number === total && data.section === "limitations";
  addHeader(slide, number, data, closing);
  if (data.layout === "outline") addAgenda(slide, data);
  else if (data.layout === "editorial") addEditorial(slide, data);
  else if (data.layout === "process") addProcess(slide, data);
  else if (data.layout === "table-led") addTableLed(slide, data, image);
  else if (data.layout === "comparison") addComparison(slide, data, image);
  else if (data.layout === "metrics") addMetrics(slide, data, image);
  else if (data.layout === "evidence-pair") addEvidencePair(slide, data, image);
  else if (data.layout === "closing") addClosing(slide, data, number, total);
  else if (data.layout === "boundaries") addBoundaries(slide, data, closing, number, total);
  else if (data.source?.kind === "table" && image) addTableLed(slide, data, image);
  else if (data.layout === "split") addFigureLed(slide, data, image, true);
  else addFigureLed(slide, data, image);
}

async function writeDeck(paper, slides, images, indices, filename) {
  const deck = baseDeck(paper);
  const coverImage = [...images].find(([index]) => ["figure", "diagram"].includes(slides[index]?.source?.kind))?.[1] || images.values().next().value;
  for (const index of indices) {
    const page = deck.addSlide();
    if (index === 0) addCover(page, paper, coverImage);
    else addContent(page, index + 1, slides[index - 1], images.get(index - 1), slides.length + 1);
  }
  await deck.writeFile({ fileName: filename });
}

async function generateNativePptx({ paper, plan, workspace, sourcePdfPath, emit = () => {}, onPage = async () => {} }) {
  const hash = createHash("sha256").update(`${paper.id}\u0000${paper.title}`).digest("hex").slice(0, 16);
  const root = path.join(workspace, ".archimedes", "presentations", hash, randomUUID());
  const media = path.join(root, "media");
  const pages = path.join(root, "pages");
  fs.mkdirSync(media, { recursive: true }); fs.mkdirSync(pages, { recursive: true });
  const fontConfig = fontConfigForPreview();
  try {
    emit("Cropping the paper's figures and tables for the native deck…");
    const images = await evidenceImages(sourcePdfPath, plan.slides, media);
    const total = plan.slides.length + 1;
    for (let index = 0; index < total; index += 1) {
      emit(`Rendering page ${index + 1} of ${total}…`);
      const pptxPath = path.join(pages, `slide-${String(index + 1).padStart(2, "0")}.pptx`);
      await writeDeck(paper, plan.slides, images, [index], pptxPath);
      const pdfPath = await toPdf(pptxPath, pages, fontConfig?.fontConfigPath);
      await onPage({ index, total, pptxPath: rel(workspace, pptxPath), pdfPath: rel(workspace, pdfPath), validation: "rendered" });
    }
    emit("Saving the editable PowerPoint deck…");
    const pptxPath = path.join(root, "presentation.pptx");
    await writeDeck(paper, plan.slides, images, Array.from({ length: total }, (_, index) => index), pptxPath);
    const pdfPath = await toPdf(pptxPath, root, fontConfig?.fontConfigPath);
    return { kind: "pptx", pptx_path: rel(workspace, pptxPath), pdf_path: rel(workspace, pdfPath), page_count: total, validation: "rendered", renderer: "native-pptx" };
  } finally {
    if (fontConfig) fs.rmSync(fontConfig.directory, { recursive: true, force: true });
  }
}

module.exports = { generateNativePptx };
