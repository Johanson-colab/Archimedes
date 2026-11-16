const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { ensureDirectory } = require('./agent/paper-to-slides-skill.cjs');
function stagePdf(workspace, input) {
  if (typeof input !== 'string' || !path.isAbsolute(input) || path.extname(input).toLowerCase() !== '.pdf') throw new Error('Choose a PDF file.');
  const source = fs.realpathSync(input), stat = fs.statSync(source);
  if (!stat.isFile() || stat.size < 5 || stat.size > 200 * 1024 * 1024) throw new Error('The PDF must be a file smaller than 200 MB.');
  const fd = fs.openSync(source, 'r');
  try { const header = Buffer.alloc(5); fs.readSync(fd, header, 0, 5, 0); if (header.toString('ascii') !== '%PDF-') throw new Error('The selected file is not a PDF.'); } finally { fs.closeSync(fd); }
  const root = fs.realpathSync(workspace), parent = ensureDirectory(root, '.archimedes/paper-to-slides');
  const dest = path.join(parent, randomUUID()); fs.mkdirSync(dest);
  const output = path.join(dest, path.basename(source)); fs.copyFileSync(source, output, fs.constants.COPYFILE_EXCL);
  return output;
}

function stageManuscriptPdf(store, workspace, input, { manuscript, threadId } = {}) {
  const { resolveResearchContext } = require("./workspace-context.cjs");
  const { verifyManuscriptOrigin, retainManuscript } = require("./manuscript-handoff.cjs");
  if (!threadId) throw new Error("Create the slides conversation before retaining its manuscript.");
  const target = resolveResearchContext(store, { threadId, workspace });
  const origin = verifyManuscriptOrigin(store, manuscript);
  if (origin.projectId !== target.projectId) throw new Error("The slides conversation belongs to another manuscript project.");
  const source = fs.realpathSync(input);
  if (source !== fs.realpathSync(path.join(origin.workspace, origin.pdfPath))) throw new Error("The selected PDF is not this manuscript build.");
  const retained = retainManuscript(store, origin, { kind: "paper-to-slides", run_id: target.thread.id });
  let output;
  try {
    output = stagePdf(target.workspace, retained.pdfPath);
    fs.writeFileSync(path.join(path.dirname(output), "manuscript-origin.json"), JSON.stringify({ version: 1, origin,
      target: { dataRoot: store.workspace, projectId: target.projectId, workspaceId: target.workspaceId, threadId: target.thread.id, executionRoot: target.workspace },
      stagedPdf: output, createdAt: new Date().toISOString() }, null, 2), { flag: "wx", mode: 0o600 });
    return output;
  } catch (error) {
    if (output) fs.rmSync(path.dirname(output), { recursive: true, force: true });
    retained.rollback();
    throw error;
  }
}
module.exports = { stagePdf, stageManuscriptPdf };
