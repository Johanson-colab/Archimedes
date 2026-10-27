const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createHash, randomUUID } = require("node:crypto");
const { createCanvas } = require("@napi-rs/canvas");
const { complete } = require("./agent.cjs");

const SLIDE_SIZE = [1280, 720];
const PAPER = "#F8F4EA";
const INK = "#292722";
const GREEN = "#1F6652";
const OCHRE = "#A56F2D";
const FONT = "Arial, PingFang SC";
const KIMI_SKILL_ROOT = "/Applications/Kimi.app/Contents/Resources/resources/daimon-bundle/app/daimon/assets/builtin-skills/pptx";
const KIMI_PYTHON = "/Applications/Kimi.app/Contents/Resources/resources/daimon-bundle/runtime/python/cpython-3.12/bin/python3";

function quoted(value) { return JSON.stringify(String(value)); }
function clean(value, limit = 2_000) { return String(value ?? "").replace(/\u0000/g, "").slice(0, limit).trim(); }
function color(value, fallback = INK) { return /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value).toUpperCase() : fallback; }
function number(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed * 100) / 100)) : fallback;
}
function relativeArtifactPath(workspace, absolute) { return path.relative(workspace, absolute).split(path.sep).join("/"); }

function parseObject(response) {
  const raw = clean(response, 80_000).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The slide designer did not return a page specification.");
  try { return JSON.parse(raw.slice(start, end + 1)); }
  catch { throw new Error("The slide designer returned invalid JSON."); }
}

function normalizeElement(input, index, hasEvidence) {
  if (!input || typeof input !== "object") return null;
  const type = String(input.type || "");
  if (!["text", "shape", "image"].includes(type)) return null;
  if (type === "image" && !hasEvidence) return null;
  const x = number(input.x, 0, 0, SLIDE_SIZE[0]);
  const y = number(input.y, 0, 0, SLIDE_SIZE[1]);
  const w = number(input.w, 0, 0, SLIDE_SIZE[0] - x);
  const h = number(input.h, 0, 0, SLIDE_SIZE[1] - y);
  if (w < 2 || h < 2) return null;
  const element = { id: `e${String(index + 1).padStart(2, "0")}`, type, bounds: [x, y, w, h] };
  if (type === "text") {
    const text = clean(input.text, 2_000);
    if (!text) return null;
    return { ...element, text, fontSize: number(input.fontSize, 22, 11, 68), color: color(input.color),
      bold: Boolean(input.bold), align: ["left", "center", "right"].includes(input.align) ? input.align : "left" };
  }
  if (type === "shape") {
    const shapeName = ["rect", "ellipse", "straightConnector1"].includes(input.shape) ? input.shape : "rect";
    return { ...element, shapeName, fill: color(input.fill, PAPER), border: color(input.border, GREEN),
      borderWidth: number(input.borderWidth, shapeName === "straightConnector1" ? 1 : 0, 0, 8) };
  }
  return { ...element, fit: input.fit === "contain" ? "contain" : "cover" };
}

function normalizePageSpec(value, { title, hasEvidence, pageType = "content" }) {
  const source = value && typeof value === "object" ? value : {};
  const elements = (Array.isArray(source.elements) ? source.elements : [])
    .slice(0, 70).map((item, index) => normalizeElement(item, index, hasEvidence)).filter(Boolean);
  if (!elements.some((item) => item.type === "text" && item.text.includes(clean(title, 20).slice(0, 8)))) {
    throw new Error("The slide designer omitted the required slide title.");
  }
  if (hasEvidence && !elements.some((item) => item.type === "image")) {
    throw new Error("The slide designer omitted the source figure supplied for this slide.");
  }
  if (elements.length < 3) throw new Error("The slide designer returned an incomplete page.");
  return { pageType, elements };
}

function blockText(value, indent = 8) {
  const pad = " ".repeat(indent);
  return `|\n${clean(value).split(/\r?\n/).map((line) => `${pad}${line}`).join("\n")}`;
}

function textMarkup(element) {
  if (!element.bold) return element.text;
  const escaped = element.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<p><strong>${escaped.replace(/\r?\n/g, "</strong></p><p><strong>")}</strong></p>`;
}

function pageYaml(page, evidencePath = "") {
  const lines = [`pageType: ${page.pageType}`, "background:", "  type: solid", `  color: ${quoted(PAPER)}`, "elements:"];
  for (const element of page.elements) {
    lines.push(`  - elementId: ${element.id}`, `    elementType: ${element.type}`, `    bounds: [${element.bounds.join(", ")}]`);
    if (element.type === "text") {
      lines.push("    content:", `      fontFamily: ${quoted(FONT)}`, `      fontSize: ${element.fontSize}`, `      color: ${quoted(element.color)}`,
        `      align: [${element.align}, top]`, "      text: " + blockText(textMarkup(element)));
    } else if (element.type === "shape") {
      lines.push(`    shapeName: ${element.shapeName}`);
      if (element.shapeName !== "straightConnector1") lines.push("    fill:", "      type: solid", `      color: ${quoted(element.fill)}`);
      if (element.borderWidth) lines.push(`    border: {style: solid, width: ${element.borderWidth}, color: ${quoted(element.border)}}`);
    } else {
      lines.push(`    src: ${quoted(evidencePath)}`, `    fit: {mode: ${element.fit}}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function mainYaml(title, count) {
  return [`title: ${quoted(title)}`, `size: [${SLIDE_SIZE.join(", ")}]`, "theme:", "  colors:", `    paper: ${quoted(PAPER)}`,
    `    ink: ${quoted(INK)}`, `    green: ${quoted(GREEN)}`, `    ochre: ${quoted(OCHRE)}`, "  textStyles:",
    `    body: {fontFamily: ${quoted(FONT)}, fontSize: 22, color: ${quoted(INK)}}`, "pages:",
    ...Array.from({ length: count }, (_, index) => `  - pages/slide-${String(index + 1).padStart(2, "0")}.page`), ""].join("\n");
}

function runProcess(command, args, { env = process.env, timeoutMs = 180_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const append = (chunk) => { output = `${output}${chunk}`.slice(-200_000); };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error(`${path.basename(command)} failed (${code ?? "timeout"}): ${output.slice(-2_000)}`));
    });
  });
}

function toolPaths() {
  const skillRoot = process.env.ARCHIMEDES_KIMI_PPTD_ROOT || KIMI_SKILL_ROOT;
  const pyz = path.join(skillRoot, "scripts", "kimi_ppt_dsl.pyz");
  const requirements = path.join(skillRoot, "scripts", "requirements.txt");
  const python = process.env.ARCHIMEDES_KIMI_PPTD_PYTHON || (fs.existsSync(KIMI_PYTHON) ? KIMI_PYTHON : "python3");
  if (!fs.existsSync(pyz) || !fs.existsSync(requirements)) {
    throw new Error("Kimi Desktop PPTD tools are not installed. Install Kimi Desktop or set ARCHIMEDES_KIMI_PPTD_ROOT.");
  }
  return { pyz, requirements, python };
}

async function ensureTool(runtimeRoot, emit = () => {}) {
  const tool = toolPaths();
  try { await runProcess(sofficePath(), ["--version"], { timeoutMs: 20_000 }); }
  catch { throw new Error("LibreOffice is required to render the PPTD deck inside Archimedes. Install LibreOffice or set ARCHIMEDES_SOFFICE."); }
  const deps = path.join(runtimeRoot, "kimi-pptd-python");
  fs.mkdirSync(deps, { recursive: true });
  const env = { ...process.env, PYTHONPATH: [deps, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter), PYTHONUTF8: "1" };
  try {
    await runProcess(tool.python, ["-c", "import ruamel.yaml, pptx, PIL, lxml, matplotlib, requests, latex2mathml"], { env, timeoutMs: 20_000 });
  } catch {
    emit("Installing Kimi PPTD converter dependencies (first run only)…");
    await runProcess(tool.python, ["-m", "pip", "install", "--disable-pip-version-check", "--target", deps, "-r", tool.requirements], { env, timeoutMs: 600_000 });
    await runProcess(tool.python, ["-c", "import ruamel.yaml, pptx, PIL, lxml, matplotlib, requests, latex2mathml"], { env, timeoutMs: 30_000 });
  }
  return { ...tool, env };
}

function sofficePath() {
  const candidates = [process.env.ARCHIMEDES_SOFFICE, "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice"), "soffice"];
  return candidates.find((candidate) => candidate && (candidate === "soffice" || fs.existsSync(candidate))) || "soffice";
}

function sourceCrop(source) {
  const crop = source?.crop;
  if (crop && [crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)) return crop;
  return null;
}

async function renderEvidenceImages(pdfPath, slides, mediaDirectory) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const document = await getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise;
  const images = new Map();
  try {
    for (let index = 0; index < slides.length; index += 1) {
      const crop = sourceCrop(slides[index].source);
      if (!crop || !["figure", "table", "diagram"].includes(slides[index].source?.kind)) continue;
      const pageNumber = Math.min(document.numPages, Math.max(1, Number(slides[index].source.page) || 1));
      const page = await document.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, 2600 / base.width, 2200 / base.height) });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const left = Math.max(0, Math.floor(crop.x * canvas.width));
      const top = Math.max(0, Math.floor(crop.y * canvas.height));
      const width = Math.min(canvas.width - left, Math.max(1, Math.ceil(crop.width * canvas.width)));
      const height = Math.min(canvas.height - top, Math.max(1, Math.ceil(crop.height * canvas.height)));
      const cropped = createCanvas(width, height);
      const croppedContext = cropped.getContext("2d");
      croppedContext.drawImage(canvas, left, top, width, height, 0, 0, width, height);
      const pixels = croppedContext.getImageData(0, 0, width, height).data;
      let xMin = width;
      let yMin = height;
      let xMax = -1;
      let yMax = -1;
      const stride = Math.max(1, Math.floor(Math.min(width, height) / 600));
      for (let y = 0; y < height; y += stride) for (let x = 0; x < width; x += stride) {
        const offset = (y * width + x) * 4;
        if (pixels[offset + 3] < 24 || (pixels[offset] > 247 && pixels[offset + 1] > 247 && pixels[offset + 2] > 247)) continue;
        xMin = Math.min(xMin, x); yMin = Math.min(yMin, y); xMax = Math.max(xMax, x); yMax = Math.max(yMax, y);
      }
      const useInk = xMax - xMin > width * .12 && yMax - yMin > height * .12;
      const padX = Math.ceil(width * .025);
      const padY = Math.ceil(height * .025);
      const sx = useInk ? Math.max(0, xMin - padX) : 0;
      const sy = useInk ? Math.max(0, yMin - padY) : 0;
      const sw = useInk ? Math.min(width - sx, xMax - sx + padX + 1) : width;
      const sh = useInk ? Math.min(height - sy, yMax - sy + padY + 1) : height;
      const target = createCanvas(sw, sh);
      target.getContext("2d").drawImage(cropped, sx, sy, sw, sh, 0, 0, sw, sh);
      const file = path.join(mediaDirectory, `evidence-${String(index + 2).padStart(2, "0")}.png`);
      fs.writeFileSync(file, target.toBuffer("image/png"));
      images.set(index, { path: file, width: sw, height: sh, page: pageNumber });
      page.cleanup();
    }
  } finally { await document.destroy(); }
  return images;
}

function slidePrompt({ paper, slide, index, total, evidence }) {
  const facts = slide ? JSON.stringify({ section: slide.section, title: slide.title, lead: slide.lead, bullets: slide.bullets,
    takeaway: slide.takeaway, visual: slide.visual, source: slide.source }) : JSON.stringify({ title: paper.title, authors: paper.authors,
    venue: paper.venue, year: paper.year, subtitle: paper.abstract?.slice(0, 500) });
  return `Design page ${index + 1}/${total} of a Chinese academic lab-meeting presentation. This page will be authored as a Kimi PPTD .page and checked/converted by Kimi's PPTD tool. It is NOT an Archimedes HTML template.\n\n` +
    `Page geometry: 1280x720 px. Palette: warm ivory ${PAPER}, ink ${INK}, forest green ${GREEN}, sparse ochre ${OCHRE}. Font: Arial, PingFang SC. Reference style: restrained academic presentation, compact type, clear hierarchy, one argument per page, evidence and explanation together. No advertising headings, decorative cards, gradients, 2x2 dashboards, or excessive whitespace. Each page should have a different composition suited to its material.\n` +
    `Keep all meaningful elements within x=55..1225 and y=42..650. Reserve the bottom 40px for a source/footer added by the presenter. Font sizes: title 32-44, body 18-25, labels 14-18. Do not put more text on the page than can fit. Use one original paper image prominently when available, never a full PDF page screenshot.\n` +
    `Required page title: ${slide?.title || paper.title}\nPage facts (do not invent new claims): ${facts}\n` +
    `Evidence image: ${evidence ? `available, aspect ratio ${(evidence.width / evidence.height).toFixed(2)}, original PDF p. ${evidence.page}. Include exactly one image element; its src is supplied by the runtime.` : "none; do not include image elements"}\n\n` +
    `Return ONLY one JSON object with "elements" array (no Markdown). Element types and keys:\n` +
    `text: {"type":"text","x":80,"y":80,"w":700,"h":60,"text":"...","fontSize":36,"color":"#292722","bold":true,"align":"left"}; ` +
    `shape: {"type":"shape","shape":"rect|ellipse|straightConnector1","x":80,"y":160,"w":700,"h":2,"fill":"#F8F4EA","border":"#1F6652","borderWidth":1}; ` +
    `image: {"type":"image","x":80,"y":200,"w":700,"h":360,"fit":"contain|cover"}. ` +
    `For an image, reserve enough area for the source to be legible. Keep figures aspect-correct with contain. Include the exact title as one text element. Use at least 3 elements, no more than 30. Do not output a src or external URL.`;
}

async function composePage(config, input) {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const message = await complete(config, [
      { role: "system", content: "You are the Kimi PPTD page author. Output a precise slide geometry JSON object only. Every factual sentence must come from the provided page facts." },
      { role: "user", content: `${slidePrompt(input)}${lastError ? `\nPrevious attempt failed: ${lastError}. Repair that issue.` : ""}` },
    ], { allowTools: false, reasoningEffort: "high", maxOutputTokens: 4096, onTextDelta: () => {} });
    try { return normalizePageSpec(parseObject(message.content), { title: input.slide?.title || input.paper.title,
      hasEvidence: Boolean(input.evidence), pageType: input.index === 0 ? "cover" : "content" }); }
    catch (error) { lastError = error.message || String(error); }
  }
  throw new Error(`Page ${input.index + 1} could not be composed: ${lastError}`);
}

async function convertAndRender(tool, entry, outputDirectory) {
  const checkOutput = await runProcess(tool.python, [tool.pyz, "check", entry, "--json"], { env: tool.env, timeoutMs: 180_000 });
  const start = checkOutput.indexOf("{");
  const report = start < 0 ? null : JSON.parse(checkOutput.slice(start));
  if (!report || report.error_count || report.issues?.some((issue) => /TextOverflow|TextOcclusion|BoundsOutside/.test(JSON.stringify(issue)))) {
    throw new Error(`Kimi PPTD validation failed: ${JSON.stringify(report?.issues || checkOutput).slice(0, 1_500)}`);
  }
  const pptx = path.join(outputDirectory, "presentation.pptx");
  const pdf = path.join(outputDirectory, "presentation.pdf");
  await runProcess(tool.python, [tool.pyz, "convert", entry, "-o", pptx], { env: tool.env, timeoutMs: 240_000 });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-soffice-"));
  try {
    await runProcess(sofficePath(), [`-env:UserInstallation=${new URL(`file://${profile}`).href}`, "--headless", "--convert-to", "pdf", "--outdir", outputDirectory, pptx], { timeoutMs: 240_000 });
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
  if (!fs.existsSync(pdf) || fs.statSync(pdf).size < 1_000) throw new Error("The Kimi PPTD deck converted, but its preview PDF was not created.");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({ data: new Uint8Array(fs.readFileSync(pdf)) }).promise;
  const pageCount = document.numPages;
  await document.destroy();
  return { pptx, pdf, pageCount, check: report };
}

async function generateKimiPptd({ paper, plan, workspace, sourcePdfPath, runtimeRoot, modelConfig, emit = () => {} }) {
  if (!sourcePdfPath || !fs.existsSync(sourcePdfPath)) throw new Error("The original paper PDF must be cached before making a PPTD presentation.");
  const tool = await ensureTool(runtimeRoot, emit);
  const paperKey = createHash("sha256").update(String(paper.id)).digest("hex").slice(0, 20);
  const outputDirectory = path.join(workspace, ".archimedes", "presentations", paperKey, randomUUID());
  const pagesDirectory = path.join(outputDirectory, "pages");
  const mediaDirectory = path.join(outputDirectory, "media");
  fs.mkdirSync(pagesDirectory, { recursive: true });
  fs.mkdirSync(mediaDirectory, { recursive: true });
  emit("Extracting original paper figures and tables…");
  const images = await renderEvidenceImages(sourcePdfPath, plan.slides, mediaDirectory);
  const total = plan.slides.length + 1;
  for (let index = 0; index < total; index += 1) {
    const slide = index === 0 ? null : plan.slides[index - 1];
    const evidence = images.get(index - 1);
    emit(`Designing PPTD page ${index + 1} of ${total}…`);
    const page = await composePage(modelConfig, { paper, slide, index, total, evidence });
    const file = path.join(pagesDirectory, `slide-${String(index + 1).padStart(2, "0")}.page`);
    fs.writeFileSync(file, pageYaml(page, evidence?.path));
  }
  const entry = path.join(outputDirectory, "presentation.pptd");
  fs.writeFileSync(entry, mainYaml(plan.title || paper.title, total));
  emit("Checking and rendering the PPTD deck…");
  const converted = await convertAndRender(tool, entry, outputDirectory);
  if (converted.pageCount !== total) throw new Error(`The rendered deck has ${converted.pageCount} pages, expected ${total}.`);
  return {
    kind: "pptd",
    pptd_path: relativeArtifactPath(workspace, entry),
    pptx_path: relativeArtifactPath(workspace, converted.pptx),
    pdf_path: relativeArtifactPath(workspace, converted.pdf),
    page_count: total,
    validation: "passed",
  };
}

module.exports = { convertAndRender, ensureTool, generateKimiPptd, mainYaml, normalizePageSpec, pageYaml, parseObject, renderEvidenceImages, runProcess, toolPaths };
