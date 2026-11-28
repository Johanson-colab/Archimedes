from pathlib import Path
import subprocess,re
w=Path('/Users/fei/Desktop/Archimedes-pr-splits/project-paper-selection')
def source(p):return subprocess.check_output(['git','show',f'f6b5ee3:{p}'],cwd=w,text=True)
s=source('electron/library-project-records.test.cjs');head=s[:s.index('function fixture')].replace('const { createWorkspaceIpc } = require("./workspace-context.cjs");\n','')
helper='''function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-paper-selection-"))), idle = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-selection-idle-"));
  store.openWorkspace(root); const owner = store;
  const a = owner.createResearchProject({ name: "Project A" }), b = owner.createResearchProject({ name: "Project B" });
  const libraryA = owner.createLibrary({ projectId: a.id, name: "A papers" }), libraryB = owner.createLibrary({ projectId: b.id, name: "B papers" });
  t.after(() => { store.openWorkspace(idle); fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(idle, { recursive: true, force: true }); });
  return { root, idle, owner, a, b, libraryA, libraryB };
}
'''
starts=[m.start() for m in re.finditer(r'^test\(',s,re.M)]+[len(s)];blocks=[]
for a,b in zip(starts,starts[1:]):
 block=s[a:b]
 if block.startswith('test("one paper'):
  block=block.replace('https://doi.org/10.1000/SHARED','10.1000/shared').replace('  f.owner.close();\n  const reopened = store.createWorkspaceStore(f.root);','  store.openWorkspace(f.idle); store.openWorkspace(f.root);\n  const reopened = store;');blocks.append(block)
 if block.startswith('test("paper/link'):
  block=block.replace('or metadata','');block='\n'.join(x for x in block.splitlines() if not any(y in x for y in ['getPaperBibliography','setPaperBibliography','repairLibraryPaperMetadata']))+'\n';blocks.append(block)
blocks.append('''test("the real preload and main selection handlers preserve the selected project relationship", async t => {
  const f = fixture(t), handlers = new Map();
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8"), start = main.indexOf('  ipcMain.handle("library:add-paper",'), end = main.indexOf('  ipcMain.handle("library:import-local-pdf",', start);
  new Function("ipcMain", "store", main.slice(start, end))({ handle: (channel, callback) => handlers.set(channel, callback) }, store);
  let bridge;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "preload.cjs"), "utf8"), { process, require(name) {
    assert.equal(name, "electron"); return { contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; } }, ipcRenderer: { invoke: (channel, input) => Promise.resolve().then(() => handlers.get(channel)({}, input)) } };
  } });
  const paper = await bridge.addLibraryPaper(f.libraryA.id, { title: "Bridge selection", authors: [] }, { reason: "Method baseline", discovery: { query: "method" } });
  assert.equal((await bridge.getProjectPaperSelection(paper.id, f.a.id)).discovery.query, "method");
  await bridge.saveProjectPaperSelection(paper.id, f.a.id, { reason: "Revised project purpose" });
  assert.equal((await bridge.getProjectPaperSelection(paper.id, f.a.id)).reason, "Revised project purpose");
  await assert.rejects(bridge.getProjectPaperSelection(paper.id, f.b.id), /access/);
});
''')
(w/'electron/project-paper-selection.test.cjs').write_text(head+helper+'\n'.join(blocks))
# Reuse the actual component harness, restricted to this feature's objects.
s=source('electron/discovery-bibliography.test.cjs');head=s[:s.index('function restoredDatabase')]
head=head.replace('const { DatabaseSync } = require("node:sqlite");\n','').replace('const { createHash } = require("node:crypto");\n','')
head='\n'.join(x for x in head.splitlines() if not any(y in x for y in ['await load("bibliography.ts"','await load("BibliographyDialog.tsx"']))+'\n'
head=head.replace('await load("discovery-state.ts", ["discoveryPaperFields", "discoveryPaperKey", "discoveryStorageKey", "readDiscoverySnapshot", "writeDiscoverySnapshot", "discoveryProvenance"]);','await load("project-paper-selection.ts", ["discoveryProvenance"]);')
a=head.index('function database(')
base=(Path('/Users/fei/Desktop/Archimedes-pr-splits/discovery-project-state/electron/discovery-project-state.test.cjs')).read_text();d=base[base.index('function database('):base.index('\ntest(',base.index('function database('))]
d=d.replace('addLibraryPaper: async (...args) => db.addPaper(...args)', 'addLibraryPaper: async (...args) => db.addPaper(...args), getProjectPaperSelection: async (...args) => db.getProjectPaperSelection(...args), saveProjectPaperSelection: async (...args) => db.saveProjectPaperSelection(...args)');head=head[:a]+d
starts=[m.start() for m in re.finditer(r'^test\(',s,re.M)]+[len(s)];blocks=[]
for a,b in zip(starts,starts[1:]):
 block=s[a:b]
 if block.startswith('test("project reasons remain'):
  block=block.replace('    data.db.close();\n    const reopened = store.createWorkspaceStore(data.root);','    const idle = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-selection-reopen-"));\n    store.openWorkspace(idle); store.openWorkspace(data.root); fs.rmSync(idle, { recursive: true, force: true });\n    const reopened = store;').replace('; reopened.close();',';');blocks.append(block)
 if block.startswith('test("conference discovery restores'):
  block=block.replace('conference discovery restores the candidate page and saves official-source provenance without re-querying','conference collection saves project purpose with the official discovery source')
  block='\n'.join(x for x in block.splitlines() if not any(y in x for y in ['const before = calls','assert.equal(calls, before)','assert.ok(document.body.textContent.includes']))+'\n';block=block.replace('scope.discoveryStorageKey(data.root, data.project.id) + ":conference"','"unused-conference"');blocks.append(block)
 if block.startswith('test("discovery creates'):
  block=block.replace('discovery creates a library inline, saves provenance, and remounts without searching across data roots','daily collection saves the current query, project purpose and degraded-source provenance')
  block=block[:block.index('    const before = feeds;')]+'''  } finally { if (unmount) await unmount(); data.close(); }
});
'''
  block='\n'.join(x for x in block.splitlines() if not any(y in x for y in ['New discovery library','click("New library")']))+'\n';block=block.replace('scope.discoveryStorageKey(dataRoot, data.project.id)','"unused-daily"');blocks.append(block)
(w/'electron/project-paper-selection-ui.test.cjs').write_text(head+'\n'.join(blocks))
(w/'electron/test-support').mkdir(exist_ok=True);(w/'electron/test-support/selection-fixture.cjs').write_text(source('electron/test-support/discovery-fixture.cjs'))
p=w/'electron/project-paper-selection-ui.test.cjs';p.write_text(p.read_text().replace('./test-support/discovery-fixture.cjs','./test-support/selection-fixture.cjs'))
