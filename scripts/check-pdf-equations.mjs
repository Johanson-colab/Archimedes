// Offline visual regression helper; uses the same detector as the reader.
// node scripts/check-pdf-equations.mjs /path/to/paper.pdf /tmp/output 6 7 8
// Optional excluded image rectangle in PDF viewport points: 6:70,77,472,237
import fs from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { equationTokens, findEquationRects } from "../src/pdf-equations.ts";

const [file, output, ...pages] = process.argv.slice(2);
if (!file || !output || !pages.length) throw new Error("Usage: check-pdf-equations.mjs PDF OUTPUT_DIR PAGE...");
await fs.mkdir(output, { recursive: true });
const doc = await pdfjs.getDocument({ data: new Uint8Array(await fs.readFile(file)) }).promise;
try {
  for (const specification of pages) {
    const [pageNumber, ...excluded] = specification.split(":");
    const n = Number(pageNumber);
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 1.8 });
    const tokens = equationTokens(await page.getTextContent(), viewport);
    // The app supplies figure boundaries from its image detector. For this
    // standalone equation-only diagnostic they can be supplied explicitly.
    const exclusions = excluded.map((entry) => {
      const [left, top, width, height] = entry.split(",").map((v) => Number(v) * viewport.scale);
      if (![left, top, width, height].every(Number.isFinite)) throw new Error("Invalid excluded rectangle");
      return { left, top, width, height };
    });
    const rects = findEquationRects(tokens, viewport.width, viewport.height, exclusions);
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    context.strokeStyle = "#6154c7";
    context.fillStyle = "#6154c712";
    context.lineWidth = 1.5;
    context.setLineDash([5, 4]);
    for (const r of rects) {
      context.fillRect(r.left, r.top, r.width, r.height);
      context.strokeRect(r.left, r.top, r.width, r.height);
    }
    await fs.writeFile(path.join(output, `page-${n}.png`), canvas.toBuffer("image/png"));
    await fs.writeFile(path.join(output, `page-${n}.json`), JSON.stringify(rects, null, 2));
    console.log(`Page ${n}: ${rects.length} equation regions`);
  }
} finally { await doc.destroy(); }
