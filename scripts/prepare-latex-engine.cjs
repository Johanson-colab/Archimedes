const fs = require('node:fs');
const path = require('node:path');
const { downloadEngineArchive, verifyEngineArchive } = require('../electron/managed-latex-engine.cjs');
const manifest = require('../shared/latex-engine.json');
// electron-builder invokes this before collecting extraResources. A failed
// checksum/download fails packaging rather than producing a broken installer.
module.exports = async function prepareLatexEngine(context) {
  const arch = { 0: 'ia32', 1: 'x64', 2: 'arm', 3: 'arm64' }[context.arch];
  if (!arch) throw new Error('Build separate x64 and arm64 installers for the managed LaTeX engine.');
  const project = context.packager.projectDir;
  const asset = manifest.platforms[`${context.electronPlatformName}-${arch}`];
  if (!asset) throw new Error('No managed compiler release for this build target.');
  const output = path.join(project, '.archimedes', 'latex-package', `${{ darwin: "mac", win32: "win", linux: "linux" }[context.electronPlatformName]}-${arch}`);
  const archiveName = asset.url.endsWith('.zip') ? 'engine.zip' : 'engine.tar.gz';
  let archive;
  const cached = path.join(output, archiveName);
  if (fs.existsSync(cached)) {
    try { archive = fs.readFileSync(cached); verifyEngineArchive(archive, asset); }
    catch { archive = null; }
  }
  if (!archive) archive = await downloadEngineArchive(asset);

  // Keep the publisher's archive intact: platform code signing must not mutate
  // an executable whose upstream digest we verify on the user's machine.
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, archiveName), archive);
  fs.copyFileSync(path.join(project, 'electron/assets/tectonic/LICENSE'), path.join(output, 'LICENSE'));
  fs.writeFileSync(path.join(output, 'SOURCE.txt'), `${manifest.name} ${manifest.version}\n${manifest.releaseUrl}\n`);
};
