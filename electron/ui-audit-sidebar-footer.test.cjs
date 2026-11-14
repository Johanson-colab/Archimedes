const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("src/App.tsx");
const account = read("src/AccountChip.tsx");
const css = read("src/styles.css");
const locale = read("src/i18n/translations/sidebarFooter.ts");

test("Settings leaves the main nav and lives in the sidebar footer as an icon action", () => {
  const settings = app.indexOf("sidebar-footer-settings");
  const apps = app.indexOf('<nav className="sidebar-nav sidebar-modules"');
  const footer = app.indexOf('<div className="sidebar-runtime">');
  assert.ok(settings > footer && footer > apps);
  assert.doesNotMatch(app, /codex-nav-item sidebar-settings-entry/);
  assert.match(app, /aria-label=\{t\("Settings"\)\}/);
  assert.match(css, /\.sidebar-footer-settings \{ display: grid; width: 30px/);
  assert.match(app, /<AccountChip compact authState=\{authState\}/);
  const accountAt = app.indexOf("<AccountChip compact authState={authState}");
  const updateAt = app.indexOf('className="sidebar-footer-update"');
  const versionAt = app.indexOf('className="sidebar-footer-version"');
  const settingsAt = app.indexOf('className="sidebar-footer-settings"');
  assert.ok(accountAt < updateAt && updateAt < versionAt && versionAt < settingsAt, "footer order: account, update, version, settings");
  assert.match(css, /\.sidebar-footer-settings \{[^}]*margin-left: auto/);
  assert.match(css, /\.sidebar-runtime \.account-chip-wrap\.compact \{[^}]*margin-right: auto/);
});

test("footer shows package version and only conditionally shows an update action", () => {
  assert.match(app, /packageMetadata from "\.\.\/package\.json"/);
  assert.match(app, /sidebar-footer-version.*packageMetadata\.version/);
  assert.match(app, /\{availableAppUpdate && <button className="sidebar-footer-update"/);
  assert.match(app, /archimedes:update-available/);
  assert.match(app, /archimedes:update-cleared/);
  assert.match(app, /parsed\.protocol === "https:" && parsed\.hostname === "github\.com"/);
  assert.match(app, /packageMetadata\.version/);
  assert.match(locale, /"Application version \{version\}"/);
  assert.match(locale, /"Update available: \{version\}"/);
  assert.match(app, /<span>\{t\("Update"\)\}<\/span>/);
  assert.doesNotMatch(app.slice(app.indexOf('className="sidebar-footer-update"'), app.indexOf('className="sidebar-footer-version"')), /<Download|<svg/);
  assert.match(css, /\.sidebar-footer-update \{[^}]*background: transparent/);
  assert.doesNotMatch(css, /\.sidebar-footer-update \{[^}]*background: var\(--accent\)/);
  assert.match(css, /\.sidebar-footer-version \{[^}]*min-width: 0;[^}]*text-overflow: ellipsis/);
  assert.match(css, /@media \(max-width: 860px\)[\s\S]*?\.sidebar-footer-version \{ display: none; \}/);
  assert.match(css, /\.sidebar-footer-update \{ height: 24px; min-height: 24px; padding: 0; font-size: 10px; \}/);
});

test("compact AccountChip is avatar-only when signed in and a single Sign in action when guest", () => {
  assert.match(app, /<AccountChip compact authState=\{authState\}/);
  assert.match(account, /compact\?: boolean/);
  assert.match(account, /user && !compact && <ChevronUp/);
  assert.match(account, /compact \? " compact" : ""/);
  assert.match(account, /\(!compact \|\| !user\)/);
  assert.match(css, /\.account-chip\.compact\.guest \.account-chip-copy small/);
  assert.match(css, /\.account-chip\.compact\.signed-in \{ width: 30px/);
});
