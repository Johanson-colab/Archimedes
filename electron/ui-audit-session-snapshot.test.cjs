const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const share = read("src/ThreadShareModal.tsx");
test("guest links require login and cannot widen custom or private exports", () => {
  assert.match(read("src/App.tsx"), /signedIn=\{Boolean\(authState\?\.user\)\}/);
  assert.match(share, /\{signedIn && <section className="snapshot-guest-link"/);
  assert.match(share, /if \(!signedIn \|\| !allSelected\) return/);
  assert.match(share, /Guest links open the complete session, not this selected frozen export/);
  assert.match(share, /key=\{props\.snapshot\.id\}/);
});
test("snapshot exports have range selection, privacy controls, and explicit feedback", () => {
  assert.match(share, /"all" \| "latest" \| "custom"/);
  assert.match(share, /Include diagnostic events/);
  assert.match(share, /Snapshot preview/);
  assert.match(share, /snapshotMarkdown/);
  assert.match(share, /snapshotImagePages/);
  assert.match(share, /role="status"/);
  assert.match(share, /InlineNotice tone="danger"/);
  assert.doesNotMatch(share, /eyebrow|Asynchronous sharing|thread-share-summary/);
});
test("long images paginate without clipping and do not fetch external resources", () => {
  const image = read("src/session-snapshot-image.ts");
  assert.match(image, /offset \+= perPage/);
  assert.match(image, /canvas\.toBlob/);
  assert.match(image, /2_000_000/);
  assert.match(image, /Choose fewer turns or download Markdown/);
  assert.doesNotMatch(image, /fetch\(|new Image\(/);
});
