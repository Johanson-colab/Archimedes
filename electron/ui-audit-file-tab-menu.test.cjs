const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readLocale } = require("./locale-source.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("src/App.tsx");
const locale = readLocale();

test("file tabs open a context menu with close and copy actions", () => {
  assert.match(app, /onContextMenu=\{\(event\) => \{ event\.preventDefault\(\); setTabMenu\(\{ file: openFile, x: event\.clientX, y: event\.clientY \}\); \}\}/);
  assert.match(app, /const tabContextMenu = tabMenu \? <MenuSurface/);
  assert.match(app, /cursor=\{\{ x: tabMenu\.x, y: tabMenu\.y \}\}/);
  assert.match(app, /ariaLabel=\{t\("File tab actions"\)\}/);
  assert.match(app, /<MenuItem onClick=\{\(\) => \{ setTabMenu\(null\); onCloseFile\(tabMenu\.file\.path\); \}\}>\{t\("Close"\)\}<\/MenuItem>/);
  assert.match(app, /onCloseOtherFiles\(tabMenu\.file\.path\)/);
  assert.match(app, /onCloseAllFiles\(\)/);
  assert.match(app, /copyTabPath\(tabMenu\.file\.path, false\)/);
  assert.match(app, /copyTabPath\(tabMenu\.file\.path, true\)/);
});

test("close others and close all guard unsaved drafts", () => {
  assert.match(app, /async function closeOtherFilePanes\(keepPath: string\)/);
  assert.match(app, /async function closeAllFilePanes\(\)/);
  assert.match(app, /closeOtherFilePanes[\s\S]*?isDraftDirty[\s\S]*?confirm\(\{ title: "Close other files\?"/);
  assert.match(app, /closeAllFilePanes[\s\S]*?isDraftDirty[\s\S]*?confirm\(\{ title: "Close all files\?"/);
  assert.match(app, /const next = keep \? \[keep\] : \[\];/);
});

test("absolute paths follow the workspace separator", () => {
  assert.match(app, /const separator = workspace\.includes\("\\\\"\) \? "\\\\" : "\/";/);
  assert.match(app, /const root = workspace\.replace\(\/\[\\\\\/\]\+\$\/, ""\);/);
  assert.match(app, /relative \? filePath : absoluteWorkspacePath\(filePath\)/);
  assert.match(app, /navigator\.clipboard\.writeText\(text\)/);
});

test("both Files surfaces wire the new menu callbacks", () => {
  const matches = app.match(/onCloseOtherFiles=\{\(filePath\) => void closeOtherFilePanes\(filePath\)\}/g) ?? [];
  const allMatches = app.match(/onCloseAllFiles=\{\(\) => void closeAllFilePanes\(\)\}/g) ?? [];
  assert.equal(matches.length, 2);
  assert.equal(allMatches.length, 2);
  assert.match(locale, /"Close others"/);
  assert.match(locale, /"Close all"/);
  assert.match(locale, /"Copy path"/);
  assert.match(locale, /"Copy relative path"/);
});
