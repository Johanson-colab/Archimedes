import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";

const root = fileURLToPath(new URL("../", import.meta.url));
const logo = JSON.parse(fs.readFileSync(path.join(root, "shared/brand-logo.json"), "utf8"));
const { dx, dy, blur, opacity } = logo.shadow;
const rectangles = logo.blocks.map(([x, y, width, height]) =>
  `    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${logo.cornerRadius}" filter="url(#block-shadow)" />`).join("\n");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 264 264" fill="none">
  <title>Archimedes</title>
  <defs>
    <filter id="block-shadow" filterUnits="userSpaceOnUse" x="16" y="20" width="240" height="200" color-interpolation-filters="sRGB">
      <feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${blur / 2}" flood-color="#000000" flood-opacity="${opacity}" />
    </filter>
  </defs>
  <rect x="12" y="12" width="240" height="240" rx="52" fill="#FFFFFF" />
  <g transform="translate(0 15)" fill="#000000">
${rectangles}
  </g>
</svg>
`;

// Canvas shadows are rasterized explicitly so SVG-filter support in platform
// rasterizers is not required. Supersampling keeps tiny transparent edges clean.
function render(size, opaque = false) {
  const resolution = Math.max(1024, size * 2);
  const canvas = createCanvas(resolution, resolution);
  const context = canvas.getContext("2d");
  const scale = resolution / 264;
  context.scale(scale, scale);
  context.fillStyle = "#FFFFFF";
  // Apple touch icons should be opaque; iOS applies its own outer mask.
  if (opaque) context.fillRect(0, 0, 264, 264);
  context.beginPath();
  context.roundRect(12, 12, 240, 240, 52);
  context.fill();
  context.translate(0, 15);
  context.fillStyle = "#000000";
  context.shadowColor = `rgba(0, 0, 0, ${opacity})`;
  context.shadowBlur = blur * scale;
  context.shadowOffsetX = dx * scale;
  context.shadowOffsetY = dy * scale;
  for (const [x, y, width, height] of logo.blocks) {
    context.beginPath();
    context.roundRect(x, y, width, height, logo.cornerRadius);
    context.fill();
  }
  const output = createCanvas(size, size);
  const target = output.getContext("2d");
  target.imageSmoothingEnabled = true;
  target.imageSmoothingQuality = "high";
  target.drawImage(canvas, 0, 0, size, size);
  return { png: output.toBuffer("image/png"), rgba: target.getImageData(0, 0, size, size).data };
}

const cache = new Map();
const image = (size) => {
  if (!cache.has(size)) cache.set(size, render(size));
  return cache.get(size);
};

// DIB + AND mask for small Windows icons; PNG-compressed high-DPI entries.
function dib(size) {
  const pixels = image(size).rgba;
  const maskStride = Math.ceil(size / 32) * 4;
  const buffer = Buffer.alloc(40 + size * size * 4 + maskStride * size);
  buffer.writeUInt32LE(40, 0);
  buffer.writeInt32LE(size, 4);
  buffer.writeInt32LE(size * 2, 8);
  buffer.writeUInt16LE(1, 12);
  buffer.writeUInt16LE(32, 14);
  buffer.writeUInt32LE(size * size * 4, 20);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const source = (y * size + x) * 4;
      const dest = 40 + ((size - 1 - y) * size + x) * 4;
      buffer[dest] = pixels[source + 2];
      buffer[dest + 1] = pixels[source + 1];
      buffer[dest + 2] = pixels[source];
      buffer[dest + 3] = pixels[source + 3];
      if (pixels[source + 3] === 0) {
        buffer[40 + size * size * 4 + (size - 1 - y) * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return buffer;
}

function ico() {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const entries = sizes.map((size) => size <= 48 ? dib(size) : image(size).png);
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(entries[index].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += entries[index].length;
  });
  return Buffer.concat([header, ...entries]);
}

function icns() {
  const types = { icp4: 16, icp5: 32, icp6: 64, ic07: 128, ic08: 256, ic09: 512, ic10: 1024, ic11: 32, ic12: 64, ic13: 256, ic14: 512 };
  const entries = Object.entries(types).map(([type, size]) => {
    const png = image(size).png;
    const header = Buffer.alloc(8);
    header.write(type, 0, "ascii");
    header.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([header, png]);
  });
  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(8 + entries.reduce((sum, entry) => sum + entry.length, 0), 4);
  return Buffer.concat([header, ...entries]);
}

const outputs = new Map([
  ["electron/assets/app-icon.svg", svg],
  ["electron/assets/app-icon-256.png", image(256).png],
  ["electron/assets/app-icon-1024.png", image(1024).png],
  ["electron/assets/app-icon.ico", ico()],
  ["electron/assets/app-icon.icns", icns()],
  ["public/favicon.svg", svg],
  ["public/favicon.ico", ico()],
  ["public/apple-touch-icon.png", render(180, true).png],
]);
for (const [file, contents] of outputs) {
  fs.writeFileSync(path.join(root, file), contents);
  console.log(file);
}
