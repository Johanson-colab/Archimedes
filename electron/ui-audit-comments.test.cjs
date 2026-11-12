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
const comments = read("src/SessionComments.tsx");
const css = read("src/session-comments.css");

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

test("comment IPC and session-position annotations are wired without a modal", () => {
  assert.match(main, /ipcMain\.handle\("comments:list"/);
  assert.match(main, /ipcMain\.handle\("comments:create"/);
  assert.match(main, /ipcMain\.handle\("comments:resolve"/);
  assert.match(preload, /listComments: \(input\)/);
  assert.match(bridge, /interface ResearchComment/);
  assert.match(app, /SessionComments/);
  assert.match(app, /Session comments/);
  assert.doesNotMatch(app, /ThreadCommentsModal/);
  assert.match(comments, /captureSessionCommentAnchor/);
  assert.match(comments, /anchor: selection\.anchor/);
  assert.match(comments, /syncProjectThreads/);
  assert.match(comments, /ResizeObserver/);
  assert.match(comments, /if \(!alive\.current\) return/);
  assert.match(comments, /onRequireHistory\(\)/);
  assert.match(css, /\.session-comment-pin \{ position: absolute/);
});

test("comment input is click-anchored and saved markers expose responsive text previews", () => {
  assert.match(comments, /xFraction: \(event\.clientX - rect\.left\)/);
  assert.match(comments, /sessionCommentPopoverPoint\(point, rect/);
  assert.match(comments, /sessionCommentSummaryWidth\(scroll\.clientWidth\)/);
  assert.match(comments, /className="session-comment-summary">\{summary\}/);
  assert.doesNotMatch(comments, />\{group\.ids\.length\}<\/button>/);
  assert.match(comments, /onPointerEnter=/);
  assert.match(comments, /onFocus=/);
  assert.match(comments, /focus=\{selection\?\.preview \? "none" : "first"\}/);
  assert.match(css, /text-overflow: ellipsis/);
});
