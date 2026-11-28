from pathlib import Path
import subprocess,re
w=Path('/Users/fei/Desktop/Archimedes-pr-splits/bibtex-interchange')
def source(p):return subprocess.check_output(['git','show',f'f6b5ee3:{p}'],cwd=w,text=True)
p=w/'electron/store.cjs';p.write_text(p.read_text().replace('    );  } else {','    );\n  } else {'))
s=source('electron/discovery-bibliography.test.cjs');head=s[:s.index('function restoredDatabase')]
head=head.replace('const { DatabaseSync } = require("node:sqlite");\n','').replace('const { createHash } = require("node:crypto");\n','')
head='\n'.join(x for x in head.splitlines() if not any(y in x for y in ['await load("discovery-state.ts"','await load("ConferenceDiscovery.tsx"','await load("LibraryView.tsx"','await load("ProjectPaperContext.tsx"']))+'\n'
a=head.index('function database(')
helper='''function database(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-bibliography-")), idle = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-bibliography-idle-"));
  store.openWorkspace(root); const db = store, project = db.createResearchProject({ name });
  const bridge = { listLibraries: async id => db.listLibraries(id), listLibraryProjects: async () => db.listLibraryProjects(), listLibraryPapers: async id => db.listPapers(id), addLibraryPaper: async (...args) => db.addPaper(...args), setPaperBibliography: async (...args) => db.setPaperBibliography(...args), repairLibraryPaperMetadata: async (...args) => db.repairLibraryPaperMetadata(...args) };
  return { root, db, project, bridge, close() { store.openWorkspace(idle); fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(idle, { recursive: true, force: true }); } };
}
''';head=head[:a]+helper
starts=[m.start() for m in re.finditer(r'^test\(',s,re.M)]+[len(s)];blocks=[]
for a,b in zip(starts,starts[1:]):
 block=s[a:b]
 if any(block.startswith('test("'+start) for start in ['BibTeX supports','BibTeX preserves','BibTeX only','citation keys are','real Library BibTeX','leaving a BibTeX','a local title-only']):blocks.append(block.replace('./library-records.cjs','./bibliography-records.cjs'))
(w/'electron/bibliography-interchange.test.cjs').write_text(head+'\n'.join(blocks))
(w/'electron/test-support').mkdir(exist_ok=True);(w/'electron/test-support/bibliography-fixture.cjs').write_text(source('electron/test-support/discovery-fixture.cjs'))
p=w/'electron/bibliography-interchange.test.cjs';p.write_text(p.read_text().replace('./test-support/discovery-fixture.cjs','./test-support/bibliography-fixture.cjs'))
s=source('electron/library-project-records.test.cjs');head=s[:s.index('function fixture')].replace('const { createWorkspaceIpc } = require("./workspace-context.cjs");\n','')
fixture=(Path('/Users/fei/Desktop/Archimedes-pr-splits/project-paper-selection/electron/project-paper-selection.test.cjs')).read_text();f=fixture[fixture.index('function fixture'):fixture.index('\ntest(',fixture.index('function fixture'))];head+=f
starts=[m.start() for m in re.finditer(r'^test\(',s,re.M)]+[len(s)];blocks=[]
for a,b in zip(starts,starts[1:]):
 block=s[a:b]
 if block.startswith('test("explicit metadata repair'):blocks.append(block)
blocks.append('''test("bibliography keys and explicit repairs persist through the actual preload and main handlers", async t => {
  const f = fixture(t), handlers = new Map(), main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8"), start = main.indexOf('  ipcMain.handle("library:add-paper",'), end = main.indexOf('  ipcMain.handle("library:import-local-pdf",', start);
  new Function("ipcMain", "store", main.slice(start, end))({ handle: (channel, callback) => handlers.set(channel, callback) }, store);
  let bridge;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "preload.cjs"), "utf8"), { process, require(name) { assert.equal(name, "electron"); return { contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; } }, ipcRenderer: { invoke: (channel, input) => Promise.resolve().then(() => handlers.get(channel)({}, input)) } }; } });
  const paper = await bridge.addLibraryPaper(f.libraryA.id, { title: "Bridge reference", doi: "10.1000/bridge-reference", authors: [] });
  await bridge.setPaperBibliography(paper.id, { citekey: "Bridge2026", entryType: "article" });
  await bridge.repairLibraryPaperMetadata(paper.id, { venue: "Confirmed venue" });
  store.openWorkspace(f.idle); store.openWorkspace(f.root);
  assert.equal((await bridge.getPaperBibliography(paper.id)).citekey, "Bridge2026");
  assert.equal(store.getPaper(paper.id).venue, "Confirmed venue");
  store.addProjectMember({ projectId: f.a.id, userId: "bibliography-viewer", role: "viewer" });
  store.setLocalIdentity({ userId: "bibliography-viewer", displayName: "Viewer" });
  try { await assert.rejects(bridge.setPaperBibliography(paper.id, { citekey: "Forbidden" }), /editor/); await assert.rejects(bridge.repairLibraryPaperMetadata(paper.id, { title: "Forbidden" }), /editor/); }
  finally { store.setLocalIdentity({ userId: "local-user", displayName: "Local user", deviceId: "local-device", deviceName: "This device" }); }
});
''')
(w/'electron/bibliography-records.test.cjs').write_text(head+'\n'.join(blocks))
