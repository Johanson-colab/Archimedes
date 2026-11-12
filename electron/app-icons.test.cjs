const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { loadImage, createCanvas } = require("@napi-rs/canvas");
const { windowIconPath, configureAppIcon } = require("./app-icons.cjs");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file));
const logo = require("../shared/brand-logo.json");

test("shared logo preserves the seven original Paper blocks and shadow", () => {
  assert.deepEqual(logo.blocks, [[156, 121, 80, 80], [28, 141, 60, 60], [28, 77, 60, 60], [92, 121, 60, 40], [136, 77, 60, 40], [176, 33, 60, 40], [37, 33, 115, 40]]);
  assert.equal(logo.cornerRadius, 3);
  assert.deepEqual(logo.shadow, { dx: 4, dy: 4, blur: 3, opacity: 0.2 });
});

test("renderer marks have unique shadow IDs, themed foregrounds and optional decorative semantics", async () => {
  const source = read("src/brand/ArchimedesMark.tsx").toString().replace(/^import[^\n]+\n/gm, "").replace("export default function", "function");
  const { transformWithOxc } = await import("vite");
  const { code } = await transformWithOxc(source, "ArchimedesMark.tsx", { jsx: { runtime: "classic" } });
  const Mark = new Function("React", "useId", "logo", `${code}\nreturn ArchimedesMark;`)(React, React.useId, logo);
  const html = renderToStaticMarkup(React.createElement("div", null,
    React.createElement(Mark, { size: 24, variant: "small" }),
    React.createElement(Mark, { size: 88, decorative: true })));
  const ids = [...html.matchAll(/<filter id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, 2);
  assert.equal([...html.matchAll(/<rect /g)].length, 14);
  assert.equal([...html.matchAll(/<feDropShadow /g)].length, 2);
  assert.equal([...html.matchAll(/fill="currentColor"/g)].length, 2);
  assert.match(html, /aria-hidden="true"/);
  for (const id of ids) assert.ok(html.includes(`url(#${id})`));
});

test("ICO includes independent correctly bounded 16–256px frames with legacy DIB small sizes", async () => {
  const data = read("electron/assets/app-icon.ico");
  assert.equal(data.readUInt16LE(0), 0);
  assert.equal(data.readUInt16LE(2), 1);
  assert.equal(data.readUInt16LE(4), 7);
  const expected = [16, 24, 32, 48, 64, 128, 256];
  let end = 6 + expected.length * 16;
  for (const [index, size] of expected.entries()) {
    const entry = 6 + index * 16;
    assert.equal(data[entry] || 256, size);
    assert.equal(data[entry + 1] || 256, size);
    assert.equal(data.readUInt16LE(entry + 6), 32);
    const length = data.readUInt32LE(entry + 8);
    const offset = data.readUInt32LE(entry + 12);
    assert.equal(offset, end);
    const payload = data.subarray(offset, offset + length);
    assert.equal(payload.length, length);
    if (size <= 48) {
      assert.equal(payload.readUInt32LE(0), 40);
      assert.equal(payload.readInt32LE(4), size);
      assert.equal(payload.readInt32LE(8), size * 2);
    } else {
      const image = await loadImage(payload);
      assert.equal(image.width, size);
      assert.equal(image.height, size);
    }
    end = offset + length;
  }
  assert.equal(end, data.length);
  assert.deepEqual(read("public/favicon.ico"), data);
});

test("ICNS contains decodable standard and Retina PNG representations through 1024px", async () => {
  const data = read("electron/assets/app-icon.icns");
  assert.equal(data.toString("ascii", 0, 4), "icns");
  assert.equal(data.readUInt32BE(4), data.length);
  const expected = { icp4: 16, icp5: 32, icp6: 64, ic07: 128, ic08: 256, ic09: 512, ic10: 1024, ic11: 32, ic12: 64, ic13: 256, ic14: 512 };
  const seen = [];
  let offset = 8;
  while (offset < data.length) {
    const type = data.toString("ascii", offset, offset + 4);
    const length = data.readUInt32BE(offset + 4);
    assert.ok(length > 8 && offset + length <= data.length);
    assert.ok(expected[type]);
    const image = await loadImage(data.subarray(offset + 8, offset + length));
    assert.equal(image.width, expected[type]);
    assert.equal(image.height, expected[type]);
    seen.push(type);
    offset += length;
  }
  assert.equal(offset, data.length);
  assert.deepEqual(seen.sort(), Object.keys(expected).sort());
});

test("PNG assets have correct sizes, transparent outer corners and neutral visible backing", async () => {
  for (const [file, size] of [["electron/assets/app-icon-256.png", 256], ["electron/assets/app-icon-1024.png", 1024], ["public/apple-touch-icon.png", 180]]) {
    const image = await loadImage(read(file));
    assert.equal(image.width, size);
    assert.equal(image.height, size);
    const context = createCanvas(size, size).getContext("2d");
    context.drawImage(image, 0, 0);
    assert.equal(context.getImageData(0, 0, 1, 1).data[3], file.startsWith("public/apple") ? 255 : 0);
    const backing = context.getImageData(Math.floor(size / 2), Math.floor(size * 0.1), 1, 1).data;
    assert.deepEqual([...backing], [255, 255, 255, 255]);
  }
  assert.deepEqual(read("public/favicon.svg"), read("electron/assets/app-icon.svg"));
});

test("native selection uses Windows ICO and high-resolution macOS Dock PNG only on macOS", () => {
  assert.equal(path.basename(windowIconPath("win32")), "app-icon.ico");
  assert.equal(path.basename(windowIconPath("linux")), "app-icon-256.png");
  assert.ok(fs.existsSync(windowIconPath("win32")));
  const calls = [];
  const app = { dock: { setIcon: (file) => calls.push(file) } };
  configureAppIcon(app, "win32");
  configureAppIcon(app, "linux");
  assert.deepEqual(calls, []);
  configureAppIcon(app, "darwin");
  assert.equal(path.basename(calls[0]), "app-icon-1024.png");
  assert.ok(fs.existsSync(calls[0]));
  assert.doesNotThrow(() => configureAppIcon({}, "darwin"));
  const main = read("electron/main.cjs").toString();
  assert.match(main, /icon: windowIconPath\(\)/);
  assert.match(main, /app.whenReady\(\).then\(async \(\) => \{\s*configureAppIcon\(app\)/);
  assert.match(main, /app.setAppUserModelId\("com.archimedes.research"\)/);
});

test("web head exposes SVG, ICO fallback and iOS touch resources", () => {
  const html = read("index.html").toString();
  assert.match(html, /type="image\/svg\+xml" href="\/favicon.svg"/);
  assert.match(html, /type="image\/x-icon" href="\/favicon.ico"/);
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon.png"/);
});
