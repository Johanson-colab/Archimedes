const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const catalog = require('../shared/official-latex-templates.json');
const { createLatexProject, writeLatexProject } = require('./latex-workspace.cjs');

// Assets are fetched from immutable upstream commits, never from mutable branches.
// Cache files are addressed and verified by hash, including on offline reuse.
async function createPaperProject(root, directory, templateId, { cacheDirectory, fetchImpl = fetch } = {}) {
  const template = catalog.find((entry) => entry.id === templateId);
  if (!template) return createLatexProject(root, directory, templateId);
  if (template.delivery !== 'download') throw new Error('Download this author kit from its official source, then import the folder.');
  const files = await loadOfficialTemplate(template, { cacheDirectory, fetchImpl });
  return writeLatexProject(root, directory || 'paper', { id: template.id, files });
}

async function loadOfficialTemplate(template, { cacheDirectory, fetchImpl = fetch } = {}) {
  const files = {};
  for (const asset of template.assets) {
    if (asset.path.split('/').some((part) => !part || part === '..' || part === '.') || path.isAbsolute(asset.path) || asset.path.includes('\\')) throw new Error('Invalid template asset path.');
    const url = new URL(asset.url);
    if (url.protocol !== 'https:' || url.hostname !== 'raw.githubusercontent.com') throw new Error('Invalid template asset source.');
    const cached = cacheDirectory && path.join(cacheDirectory, asset.sha256);
    let data = cached && fs.existsSync(cached) ? fs.readFileSync(cached) : null;
    const matches = (buffer) => createHash('sha256').update(buffer).digest('hex') === asset.sha256;
    if (!data || !matches(data)) {
      let response;
      try {
        response = await fetchImpl(asset.url, { signal: AbortSignal.timeout(30_000) });
      } catch (error) {
        throw new Error(`Cannot download ${template.name} from raw.githubusercontent.com: ${error.message}. Connect to the Internet or import a downloaded author kit.`, { cause: error });
      }
      if (!response.ok) throw new Error(`Cannot download ${template.name}: HTTP ${response.status}. Check network access to raw.githubusercontent.com.`);
      data = Buffer.from(await response.arrayBuffer());
      if (data.length > 5_000_000 || !matches(data)) throw new Error(`Template checksum verification failed: ${asset.path}`);
      if (cached) { fs.mkdirSync(cacheDirectory, { recursive: true }); fs.writeFileSync(cached, data); }
    }
    files[asset.path] = asset.binary ? data : data.toString('utf8');
  }
  if (!files['main.tex']) throw new Error('The official author kit has no main document.');
  files['ARCHIMEDES-SOURCE.txt'] = `${template.name}\nSource: ${template.sourceUrl}\nRevision: ${template.revision}\nSource type: ${template.sourceKind || "official"}\nVenue instructions: ${template.officialSourceUrl || template.sourceUrl}\nOriginal mirror/upstream files; main document renamed to main.tex.\nFollow the venue author instructions and upstream terms.\n`;
  return files;
}
module.exports = { createPaperProject, loadOfficialTemplate };
