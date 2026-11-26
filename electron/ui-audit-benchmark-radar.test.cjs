const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const view = fs.readFileSync(path.join(root, "src", "BenchmarkRadarView.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const translations = fs.readFileSync(path.join(root, "src", "i18n", "translations", "benchmarkRadar.ts"), "utf8");

test("Benchmark Radar dates follow UI language and keep date-only releases in UTC", () => {
  assert.match(view, /function localeFor\(language: Language\)[\s\S]*?language === "zh" \? "zh-CN" : "en-US"/);
  assert.match(view, /toLocaleDateString\(localeFor\(language\), \{[\s\S]*?timeZone: "UTC"/);
  assert.match(view, /formatDate\(record\.releasedAt, language\)/);
  assert.match(view, /formatDate\(data\.updatedAt, language, true\)/);
  assert.match(view, /formatTimestamp\(data\.fetchedAt, language\)/);
  assert.match(translations, /"Released": "发布于"/);
});

test("Benchmark Radar keeps a readable, stepped type scale", () => {
  assert.match(css, /--benchmark-meta-size: 12px/);
  assert.match(css, /--benchmark-control-size: 13px/);
  assert.match(css, /--benchmark-body-size: 14px/);
  assert.match(css, /--benchmark-section-size: 21px/);
  assert.match(css, /\.benchmark-row p \{[^}]*font-size: var\(--benchmark-body-size\)/);
  assert.match(css, /\.benchmark-date strong \{ font-size: 14px;/);
});
