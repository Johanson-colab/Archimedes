const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { preparePaperReader } = require('./library-reader.cjs');

// Parse and stage the chosen PDF before creating any library entry. Identical
// local files share a canonical key even when the filenames differ.
async function importLocalPaper({ workspace, libraryId, localPath, store, prepare = preparePaperReader }) {
  const stagingId = `import-${randomUUID()}`;
  const title = path.basename(localPath, path.extname(localPath)).trim() || 'Untitled paper';
  let stagedPath;
  try {
    const asset = await prepare({ workspace, paper: { id: stagingId }, localPath });
    stagedPath = path.join(workspace, asset.relative_path);
    store.openWorkspace(workspace);
    const paper = store.addPaper(libraryId, { title: title.slice(0, 1000), authors: [], source: 'local', canonical_key: `local-pdf:${asset.sha256}` });
    const relativePath = `.archimedes/papers/${paper.id}.pdf`;
    const outputPath = path.join(workspace, relativePath);
    fs.renameSync(stagedPath, outputPath);
    stagedPath = undefined;
    store.replacePaperReaderAsset(paper.id, { ...asset, relative_path: relativePath });
    return store.getPaper(paper.id);
  } finally {
    if (stagedPath) fs.rmSync(stagedPath, { force: true });
  }
}
module.exports = { importLocalPaper };
