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
module.exports = { stagePdf };
