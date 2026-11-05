const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readLocale } = require("./locale-source.cjs");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const registry = fs.readFileSync(path.join(root, "src", "sidebar-registry.tsx"), "utf8");
const view = fs.readFileSync(path.join(root, "src", "NewsView.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const sidebarSettings = fs.readFileSync(path.join(root, "electron", "sidebar-settings.cjs"), "utf8");
const news = fs.readFileSync(path.join(root, "electron", "news.cjs"), "utf8");
const sources = fs.readFileSync(path.join(root, "electron", "news-sources.cjs"), "utf8");
const i18n = readLocale();

test("News is a Discovery & tracking app ordered between Daily papers and Benchmark Radar", () => {
  assert.match(registry, /id: "news"[^\n]*labelKey: "News"[^\n]*icon: Newspaper/);
  const metadata = require("../shared/research-apps.json").apps;
  const daily = metadata.daily.order;
  const newsOrder = metadata.news.order;
  const radar = metadata["benchmark-radar"].order;
  assert.equal(metadata.news.category, "discovery");
  assert.equal(metadata.news.defaultEnabled, false);
  assert.ok(newsOrder > daily && newsOrder < radar, "daily → news → benchmark radar");
  assert.match(sidebarSettings, /const CORE_MODULE_IDS = \[[^\]]*"news"/);
});

test("News view is registry-hosted with a real bridge, not a static import", () => {
  assert.match(app, /lazy\(\(\) => import\("\.\/NewsView"\)\)/);
  assert.doesNotMatch(app, /import NewsView from "\.\/NewsView"/);
  assert.match(app, /news: <NewsView bridge=\{desktopBridge\} projectId=\{activeProjectId\} active=\{mainSection === "news"\} onSendToChat=\{sendNoteToChat\} \/>/);
  assert.match(app, /if \(mainSection !== "chat" && mainSection !== "files" && hiddenCoreModules\.has\(mainSection\)\)/);
});

test("News defaults to the single-column feed and offers a board toggle", () => {
  assert.match(view, /useState<"feed" \| "board">\("feed"\)/);
  assert.match(view, /<Tab value="feed">/);
  assert.match(view, /<Tab value="board">/);
  assert.match(view, /news-view-tabs/);
  assert.match(css, /\.news-feed \{ width: min\(880px, 100%\)/);
  assert.match(css, /\.news-board \{ column-count: 3/);
});

test("News controls live in the page, not the global toolbar", () => {
  assert.doesNotMatch(view, /ToolbarActions|ToolbarPortal|module-toolbar-actions/);
  assert.match(view, /news-page-head/);
  assert.match(view, /className="quiet-icon-button"[^>]*onClick=\{\(\) => void refresh\(\)\}/);
  assert.match(view, /className="quiet-icon-button"[^>]*onClick=\{openSettings\}/);
});

test("News cards render the source structure and its original media", () => {
  assert.match(view, /function HackerNewsCard/);
  assert.match(view, /function XCard/);
  assert.match(view, /function RedditCard/);
  assert.match(view, /function GitHubCard/);
  assert.match(view, /function ArxivCard/);
  assert.match(view, /function RssCard/);
  assert.match(view, /function MediaGallery/);
  assert.match(view, /<img[\s\S]{0,200}loading="lazy"/);
  assert.match(view, /referrerPolicy="no-referrer"/);
  assert.match(css, /\.news-media img \{[^}]*object-fit: cover/);
  assert.match(css, /\.news-media\.one img \{ object-fit: contain/);
});

test("News actions save to Library, ask the agent and open the original", () => {
  assert.match(view, /bridge\.setNewsSaved\(item\.id, next\)/);
  assert.match(view, /bridge\.createLibrary\(\{ projectId: projectId \?\? undefined, name: t\("Saved news"\)/);
  assert.match(view, /bridge\.addLibraryPaper\(library\.id, paper\)/);
  assert.match(view, /onSendToChat\(/);
  assert.match(view, /bridge\.openExternalUrl\(item\.url\)/);
  assert.match(view, /bridge\.markNewsRead\(item\.id, true\)/);
});

test("News API surface is wired through preload and main", () => {
  const main = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");
  const preload = fs.readFileSync(path.join(root, "electron", "preload.cjs"), "utf8");
  for (const channel of ["news:get-settings", "news:set-settings", "news:list", "news:refresh", "news:mark-read", "news:set-saved"]) {
    assert.ok(main.includes(`ipcMain.handle("${channel}"`), `main handles ${channel}`);
  }
  assert.match(preload, /listNews: \(filters\) => ipcRenderer\.invoke\("news:list", filters\)/);
  assert.match(preload, /refreshNews: \(input\) => ipcRenderer\.invoke\("news:refresh", input\)/);
  assert.match(main, /news\.initialize\(app\.getPath\("userData"\)\)/);
});

test("News keeps secrets out of the renderer and ships default feeds", () => {
  assert.match(news, /clientSecret: "", configured: Boolean/);
  assert.match(news, /bearerToken: "", configured: Boolean/);
  assert.match(news, /https:\/\/www\.theverge\.com\/rss\/index\.xml/);
  assert.match(news, /https:\/\/arstechnica\.com\/feed\//);
  assert.match(sources, /canonicalUrl/);
  assert.match(sources, /parseRssFeed/);
  assert.match(sources, /fetchRedditToken/);
});

test("News strings are translated", () => {
  assert.match(i18n, /"News": "News"/);
  assert.match(i18n, /"News settings": "News 设置"/);
  assert.match(i18n, /"Ask AI": "向 AI 提问"/);
  assert.match(i18n, /"Newest": "最新"/);
  assert.match(i18n, /"Save to Library": "保存到 Library"/);
});
