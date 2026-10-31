const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const store = read("electron/store.cjs");
const main = read("electron/main.cjs");
const preload = read("electron/preload.cjs");
const bridge = read("src/vite-env.d.ts");
const app = read("src/App.tsx");
const modal = read("src/ThreadCommentsModal.tsx");
const css = read("src/styles.css");

test("comments are project-scoped, author-attributed, and auditable", () => {
  assert.match(store, /CREATE TABLE IF NOT EXISTS comments/);
  assert.match(store, /function assertCommentResource/);
  assert.match(store, /function listComments/);
  assert.match(store, /function createComment/);
  assert.match(store, /function setCommentResolved/);
  assert.match(store, /function deleteComment/);
  assert.match(store, /comment\.created/);
  assert.match(store, /This research thread is a private draft/);
});

test("comment IPC and the thread discussion modal are wired", () => {
  assert.match(main, /ipcMain\.handle\("comments:list"/);
  assert.match(main, /ipcMain\.handle\("comments:create"/);
  assert.match(main, /ipcMain\.handle\("comments:resolve"/);
  assert.match(preload, /listComments: \(input\)/);
  assert.match(bridge, /interface ResearchComment/);
  assert.match(app, /ThreadCommentsModal/);
  assert.match(app, /Thread comments/);
  assert.match(modal, /Thread discussion/);
  assert.match(modal, /No comments yet/);
  assert.match(modal, /Commenter access required/);
  assert.match(css, /\.thread-comments-modal/);
});
