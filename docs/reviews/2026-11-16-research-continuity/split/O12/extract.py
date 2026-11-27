from pathlib import Path
import subprocess,re
w=Path('/Users/fei/Desktop/Archimedes-pr-splits/project-paper-selection')
def source(p):return subprocess.check_output(['git','show',f'f6b5ee3:{p}'],cwd=w,text=True)
s=source('electron/library-records.cjs');s=s[s.index('function assertPaperAccess'):s.index('function bibliography')];s+='module.exports = { assertPaperAccess, getSelection, saveSelection };\n';(w/'electron/project-paper-selection.cjs').write_text(s)
s=source('src/discovery-state.ts');s=s[:s.index('export type DiscoverySnapshot')]+s[s.index('export function discoveryProvenance'):];s=s.replace('Pick<DiscoverySnapshot, "mode" | "range" | "topic" | "searchKind" | "submittedQuery" | "response" | "deepResponse">','{ mode: DailyDiscoveryMode | "conference"; range: DailyDiscoveryRange; topic: DailyDiscoveryTopic; searchKind: "quick" | "deep"; submittedQuery: string; response: DailyDiscoveryResponse | null; deepResponse: DeepPaperSearchResponse | null }');(w/'src/project-paper-selection.ts').write_text(s)
s=source('src/ProjectPaperContext.tsx').replace('./discovery-state','./project-paper-selection');(w/'src/ProjectPaperContext.tsx').write_text(s)
p=w/'electron/store.cjs';s=p.read_text();s=s.replace('const librarySeeds =','const paperSelection = require("./project-paper-selection.cjs");\nconst librarySeeds =',1)
marker='    CREATE TABLE IF NOT EXISTS paper_reader_assets ('
s=s.replace(marker,'''    CREATE TABLE IF NOT EXISTS project_paper_selections (
      project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      reason TEXT NOT NULL DEFAULT '',
      discovery_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, paper_id)
    ) STRICT;

'''+marker,1)
s=s.replace('function addPaper(libraryId, paper) {','''function addPaper(libraryId, paper, selection) {
  const db = requireDatabase();
  db.exec("SAVEPOINT add_paper_selection");
  try {
    const result = addPaperRecord(libraryId, paper);
    if (selection !== undefined) {
      const library = db.prepare("SELECT project_id FROM libraries WHERE id = ?").get(libraryId);
      saveProjectPaperSelection(result.id, library.project_id, selection);
    }
    db.exec("RELEASE add_paper_selection");
    return result;
  } catch (error) { db.exec("ROLLBACK TO add_paper_selection"); db.exec("RELEASE add_paper_selection"); throw error; }
}

function getProjectPaperSelection(paperId, projectId) { return paperSelection.getSelection(requireDatabase(), paperId, projectId, canAccessProject); }
function saveProjectPaperSelection(paperId, projectId, patch = {}) { return paperSelection.saveSelection(requireDatabase(), paperId, projectId, patch, canAccessProject); }

function addPaperRecord(libraryId, paper) {''',1)
s=s.replace('module.exports = {','module.exports = {\n  getProjectPaperSelection,\n  saveProjectPaperSelection,',1);p.write_text(s)
p=w/'electron/main.cjs';s=p.read_text().replace('(_event, { libraryId, paper }) => {','(_event, { libraryId, paper, selection }) => {',1).replace('return store.addPaper(libraryId, paper);','return store.addPaper(libraryId, paper, selection);',1);marker='  ipcMain.handle("library:import-local-pdf",';s=s.replace(marker,'  ipcMain.handle("library:get-project-selection", (_event, { paperId, projectId }) => store.getProjectPaperSelection(paperId, projectId));\n  ipcMain.handle("library:save-project-selection", (_event, { paperId, projectId, patch }) => store.saveProjectPaperSelection(paperId, projectId, patch));\n\n'+marker,1);p.write_text(s)
p=w/'electron/preload.cjs';s=p.read_text().replace('addLibraryPaper: (libraryId, paper) => ipcRenderer.invoke("library:add-paper", { libraryId, paper }),','addLibraryPaper: (libraryId, paper, selection) => ipcRenderer.invoke("library:add-paper", { libraryId, paper, selection }),\n  getProjectPaperSelection: (paperId, projectId) => ipcRenderer.invoke("library:get-project-selection", { paperId, projectId }),\n  saveProjectPaperSelection: (paperId, projectId, patch) => ipcRenderer.invoke("library:save-project-selection", { paperId, projectId, patch }),');p.write_text(s)
p=w/'src/vite-env.d.ts';s=p.read_text().replace('addLibraryPaper: (libraryId: string, paper: AcademicSearchResult)', 'addLibraryPaper: (libraryId: string, paper: AcademicSearchResult, selection?: { reason?: string; discovery?: Record<string, unknown> })');marker='    updateLibraryPaper:';s=s.replace(marker,'    getProjectPaperSelection: (paperId: string, projectId: string) => Promise<import("./project-paper-selection").ProjectPaperSelection | null>;\n    saveProjectPaperSelection: (paperId: string, projectId: string, patch: { reason?: string; discovery?: Record<string, unknown> }) => Promise<import("./project-paper-selection").ProjectPaperSelection>;\n'+marker,1);p.write_text(s)
p=w/'src/LibraryView.tsx';s=p.read_text();final=source('src/LibraryView.tsx');s=s.replace('import ConferenceDiscovery from "./ConferenceDiscovery";', 'import ConferenceDiscovery from "./ConferenceDiscovery";\nimport ProjectPaperContext from "./ProjectPaperContext";\nimport { discoveryProvenance, type SelectionBridge } from "./project-paper-selection";')
s=s.replace('renderInspector={(inspectorProps) => <PaperInspector {...inspectorProps} />}', 'renderInspector={(inspectorProps) => <PaperInspector {...inspectorProps} bridge={bridge} projectId={projectId} />}')
s=s.replace('function PaperInspector({ paper,', 'function PaperInspector({ bridge, projectId, paper,',1).replace('}: { paper: LibraryPaper | null;', '}: { bridge: ResearchDeskBridge; projectId?: string | null; paper: LibraryPaper | null;',1)
s=s.replace('    <LibraryPaperNotes key={paper.id}', '    <ProjectPaperContext key={`${projectId}:${paper.id}`} bridge={bridge} paperId={paper.id} projectId={projectId} />\n    <LibraryPaperNotes key={paper.id}',1)
s=s.replace('return <DailyDiscovery initialMode=', 'return <DailyDiscovery projectId={projectId} initialMode=',1).replace('function DailyDiscovery({ initialMode', 'function DailyDiscovery({ projectId, initialMode',1).replace('onImported }: { initialMode?: DailyDiscoveryMode', 'onImported }: { projectId?: string | null; initialMode?: DailyDiscoveryMode',1)
start=s.index('function DailyDiscovery(');tail=s[start:];tail=tail.replace('  const [error, setError] = useState("");','  const [error, setError] = useState("");\n  const [reasons, setReasons] = useState<Record<string, string>>({});',1)
tail=tail.replace('      await bridge.addLibraryPaper(targetLibraryId, paper);','''      await (bridge as SelectionBridge).addLibraryPaper(targetLibraryId, paper, projectId ? {
        ...(reasons[key]?.trim() ? { reason: reasons[key].trim() } : {}),
        discovery: discoveryProvenance({ mode, range, topic, searchKind, submittedQuery, response, deepResponse }, paper),
      } : undefined);''',1)
tail=tail.replace('<ConferenceDiscovery bridge=', '<ConferenceDiscovery projectId={projectId} bridge=',1).replace('onSave={add} />','onSave={add} reasons={reasons} onReason={(key, reason) => setReasons((current) => ({ ...current, [key]: reason }))} />',1)
label=next(x for x in final.splitlines() if '<label>{t("Project selection reason")}' in x and 'setReasons' in x);tail=tail.replace('          <div className="daily-paper-signals">',label+'\n          <div className="daily-paper-signals">',1)
a=tail.index('\nfunction DeepSearchResults');b=tail.index('\nfunction formatPaperDate',a);fa=final.index('\nfunction DeepSearchResults');fb=final.index('\nfunction formatPaperDate',fa);deep=final[fa:fb].replace('const key = discoveryPaperKey(paper);','const key = paper.external_id || paper.title;');tail=tail[:a]+deep+tail[b:];s=s[:start]+tail;p.write_text(s)
p=w/'src/ConferenceDiscovery.tsx';s=p.read_text().replace('const PRESENTATIONS:', 'import { useUISettings } from "./i18n";\nimport type { SelectionBridge } from "./project-paper-selection";\nconst PRESENTATIONS:',1).replace('{ bridge, targetLibraryId,','{ projectId, bridge, targetLibraryId,',1).replace('  bridge: ResearchDeskBridge; targetLibraryId:', '  projectId?: string | null; bridge: ResearchDeskBridge; targetLibraryId:',1)
s=s.replace('  const [conference,', '  const { t } = useUISettings();\n  const [reasons, setReasons] = useState<Record<string, string>>({});\n  const [conference,',1)
f=source('src/ConferenceDiscovery.tsx');a=f.index('      await (bridge as SelectionBridge).addLibraryPaper');b=f.index('\n      if (!alive.current)',a);s=s.replace('      await bridge.addLibraryPaper(targetLibraryId, paper);',f[a:b],1)
label=next(x for x in f.splitlines() if '<label>{t("Project selection reason")}' in x);s=s.replace('            <div className="daily-paper-signals">',label+'\n            <div className="daily-paper-signals">',1);p.write_text(s)
p=w/'src/library-workspace.css';s=p.read_text();final=source('src/library-workspace.css');css=[x for x in final.splitlines() if x.startswith('.paper-project-context') or x.startswith('.daily-paper-content > label')];s+='\n'+'\n'.join(css)+'\n';p.write_text(s)
p=w/'src/library-preview.ts';s=p.read_text();f=source('src/library-preview.ts');s='import type { ProjectPaperSelection } from "./project-paper-selection";\n'+s;s=s.replace('const previewLinks =','const previewSelections = new Map<string, ProjectPaperSelection>();\nconst previewLinks =',1).replace('addLibraryPaper: async (libraryId: string, paper: AcademicSearchResult)', 'addLibraryPaper: async (libraryId: string, paper: AcademicSearchResult, selection?: { reason?: string; discovery?: Record<string, unknown> })',1)
a=f.index('    if (selection) {');b=f.index('    return { ...(previewPapers',a);s=s.replace('    return { ...(previewPapers.get(id) as LibraryPaper) };',f[a:b]+'    return { ...(previewPapers.get(id) as LibraryPaper) };',1)
a=f.index('  getProjectPaperSelection:');b=f.index('  getPaperBibliography:',a);s=s.replace('  updateLibraryPaper:',f[a:b]+'  updateLibraryPaper:',1);p.write_text(s)
p=w/'src/i18n/translations/library.ts';lines=p.read_text().splitlines();keys=['Discovery source and criteria','Machine match explanation','Project selection reason','Project selection reasons are separate from your personal reading notes.','Save selection reason','Saved with degraded discovery results','Why this paper in this project','Your reason for selecting this paper'];add=[x for x in source('src/i18n/translations/library.ts').splitlines() if any(x.startswith('  "'+k+'":') for k in keys)]
for x in add:
 key=x.split('"',2)[1].lower();idx=next((i for i,line in enumerate(lines) if line.startswith('  "') and line.split('"',2)[1].lower()>key),len(lines)-1);lines.insert(idx,x)
p.write_text('\n'.join(lines)+'\n')
