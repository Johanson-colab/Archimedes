// Real orchestration/filesystem with a controlled compiler fixture; not TeX.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const repo = path.resolve(__dirname, '../../../..');
const latex = require(path.join(repo, 'electron/latex-workspace.cjs'));
const { createManagedCompiler } = require(path.join(repo, 'electron/managed-latex-engine.cjs'));
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-v03-before-')));
const hash = data => createHash('sha256').update(data).digest('hex');
async function main() {
  const a = path.join(root, 'a'), b = path.join(root, 'b');
  for (const dir of [a,b]) {
    fs.mkdirSync(path.join(dir, 'paper'), {recursive:true});
    fs.writeFileSync(path.join(dir, 'paper/main.tex'), '\\input{section}\n');
    fs.writeFileSync(path.join(dir, 'paper/section.tex'), 'section-v1');
    fs.writeFileSync(path.join(dir, 'paper/refs.bib'), 'bib-v1');
  }
  const spawnImpl = (_command, args, options) => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
    const content = fs.readFileSync(path.join(options.cwd, 'section.tex'), 'utf8');
    process.nextTick(() => { const out = args[args.indexOf('--outdir')+1]; fs.writeFileSync(path.join(out,'main.pdf'), '%PDF-fixture '+content); child.stdout.emit('data', content); child.emit('close',0,null); });
    return child;
  };
  const first = await latex.compileLatexDocument(a,'paper/main.tex',{executable:'tectonic',spawnImpl});
  const firstBytes = fs.readFileSync(path.join(a, first.pdf_path));
  fs.writeFileSync(path.join(a, 'paper/section.tex'),'section-v2');
  const second = await latex.compileLatexDocument(a,'paper/main.tex',{executable:'tectonic',spawnImpl});
  const oldPathChanged = !firstBytes.equals(fs.readFileSync(path.join(a,first.pdf_path)));

  const runtimeRoot = path.join(root,'runtime'), platform = process.platform, arch = process.arch;
  const binary = Buffer.from('fixture-never-executed'), version = 'probe';
  const binaryPath = path.join(runtimeRoot,'engines',version,`${platform}-${arch}`,platform==='win32'?'tectonic.exe':'tectonic');
  fs.mkdirSync(path.dirname(binaryPath),{recursive:true});fs.writeFileSync(binaryPath,binary);
  const compiler = createManagedCompiler({runtimeRoot,platform,arch,engineManifest:{version,platforms:{[`${platform}-${arch}`]:{executableSha256:hash(binary)}}}});
  const original = latex.compileLatexDocument;
  let release, entered;
  const gate = new Promise(resolve=>{release=resolve}), active = new Promise(resolve=>{entered=resolve});
  latex.compileLatexDocument = async workspace => { if(workspace===a){entered();await gate} return {ok:true,diagnostics:[],log:workspace===a?'A':'B',pdf_path:'fixture.pdf'}; };
  try {
    const busy = compiler(a,'paper/main.tex'); await active;
    const queuedOld = compiler(b,'paper/main.tex');
    fs.writeFileSync(path.join(b,'paper/section.tex'),'section-v2');fs.writeFileSync(path.join(b,'paper/refs.bib'),'bib-v2');
    const queuedNew = compiler(b,'paper/main.tex');
    const changedInputsSharePromise = queuedOld===queuedNew;
    release();await Promise.all([busy,queuedOld,queuedNew]);
    console.log(JSON.stringify({fixture:'controlled compiler, not real TeX', firstPdfPath:first.pdf_path,secondPdfPath:second.pdf_path,oldPathChanged,changedInputsSharePromise},null,2));
    if(process.argv.includes('--assert-fixed')) { assert.equal(oldPathChanged,false); assert.equal(changedInputsSharePromise,false); }
  } finally { latex.compileLatexDocument=original; }
}
main().finally(()=>fs.rmSync(root,{recursive:true,force:true})).catch(error=>{console.error(error);process.exitCode=1});
