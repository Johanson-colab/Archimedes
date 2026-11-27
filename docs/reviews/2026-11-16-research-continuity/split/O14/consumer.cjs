const fs=require('node:fs'),cp=require('node:child_process');
const dir='/Users/fei/Desktop/Archimedes-pr-splits/project-data-analysis';
const old=(file)=>cp.execFileSync('git',['show','f6b5ee3:'+file],{cwd:dir,encoding:'utf8'});
const read=f=>fs.readFileSync(dir+'/'+f,'utf8'),write=(f,s)=>fs.writeFileSync(dir+'/'+f,s);
let s=read('src/task-selection.ts');s+='\nexport function analysisOwnerKey(selection: TaskSelection): string {\n  return JSON.stringify([selection.dataRoot, selection.projectId, selection.workspaceId, selection.executionRoot]);\n}\n';write('src/task-selection.ts',s);
s=read('src/App.tsx').replace('import { newTaskSelection,','import { analysisOwnerKey, newTaskSelection,');
s='import type { AnalysisChatInput, ProjectResultsBridge } from "./project-results";\n'+s;
s=s.replace('  const executionWorkspace = taskSelection.executionRoot;', '  const executionWorkspace = taskSelection.executionRoot;\n  const analysisSelection = newTaskSelection(workspace, activeProject, workspaces, activeWorkspaceId);\n  const currentAnalysisOwner = analysisOwnerKey(analysisSelection);');
s=s.replace('  const [dataAnalysisOpened, setDataAnalysisOpened]', '  const analysisSessionsRef = useRef(new Map<string, string>());\n  const analysisHandoffsRef = useRef(new Map<string, Promise<ResearchThreadDetail>>());\n  const [dataAnalysisOpened, setDataAnalysisOpened]');
const oldApp=old('src/App.tsx'),start=oldApp.indexOf('  async function continueAnalysisInChat('),end=oldApp.indexOf('\n  function sendNoteToChat(',start);
s=s.replace('  function sendNoteToChat(',oldApp.slice(start,end)+'\n\n  function sendNoteToChat(');
s=s.replace('"data-analysis": <DataAnalysisView onAskAI={(text) => sendNoteToChat(text, "replace")} />', '"data-analysis": <DataAnalysisView ownerKey={currentAnalysisOwner} owner={analysisSelection.projectId && analysisSelection.workspaceId ? { projectId: analysisSelection.projectId, workspaceId: analysisSelection.workspaceId, executionRoot: analysisSelection.executionRoot } : undefined} bridge={typeof (desktopBridge as ResearchDeskBridge & Partial<ProjectResultsBridge>).saveProjectResult === "function" ? desktopBridge as ResearchDeskBridge & ProjectResultsBridge : undefined} onAskAI={(text, input, isCurrent) => continueAnalysisInChat(text, input, analysisSelection, isCurrent)} />');
write('src/App.tsx',s);
s=read('electron/workspace-files.cjs').replace('const MAX_TEXT_BYTES = 2_000_000;','const MAX_TEXT_BYTES = 10 * 1024 * 1024;');write('electron/workspace-files.cjs',s);
s=read('electron/workspace-context.cjs');s=s.replace('  const projectId = thread?.project_id || input.projectId;', `  const result = input.basedOnResultId ? store.getProjectResultRecord(input.basedOnResultId) : null;
  if (input.basedOnResultId && !result) throw new Error("The source project result does not exist in this data workspace.");
  if (thread && result) throw new Error("Choose one source conversation or project result.");
  if (result && input.projectId && input.projectId !== result.projectId) throw new Error("The source result does not belong to the selected project.");
  if (result && input.workspaceId && input.workspaceId !== result.workspaceId) throw new Error("The source result does not belong to the selected project workspace.");
  const projectId = thread?.project_id || result?.projectId || input.projectId;`);
s=s.replace('const workspaceId = thread?.workspace_id || input.workspaceId;', 'const workspaceId = thread?.workspace_id || result?.workspaceId || input.workspaceId;').replace('canonicalWorkspace(thread?.workspace_path || workspace.root', 'canonicalWorkspace(thread?.workspace_path || result?.executionRoot || workspace.root');write('electron/workspace-context.cjs',s);
s=read('electron/thread-commands.cjs').replace('workspace: input.workspacePath });','workspace: input.workspacePath, basedOnResultId: input.basedOnResultId });').replace('      visibility: input.visibility,\n    });', '      visibility: input.visibility,\n      basedOnResultId: input.basedOnResultId,\n    });');write('electron/thread-commands.cjs',s);
s=read('electron/store.cjs');const marker='  ensureColumn(db, "research_threads", "unread_count", "INTEGER NOT NULL DEFAULT 0");';s=s.replace(marker,marker+'\n  ensureColumn(db, "research_threads", "based_on_result_id", "TEXT REFERENCES project_results(id) ON DELETE SET NULL");');
const fstart=s.indexOf('function createResearchThread('),fend=s.indexOf('\nfunction ',fstart+10);let f=s.slice(fstart,fend);
f=f.replace('  forkId = null,','  forkId = null,\n  basedOnResultId = null,');f=f.replace('  const db = requireDatabase();', `  const db = requireDatabase();
  const basedOnResult = basedOnResultId ? getProjectResultRecord(basedOnResultId) : null;
  if (basedOnResultId && !basedOnResult) throw new Error("The source project result does not exist in this data workspace.");
  if (basedOnResult) {
    if ((projectId && projectId !== basedOnResult.projectId) || (workspaceId && workspaceId !== basedOnResult.workspaceId)) throw new Error("The source result does not belong to this project workspace.");
    if (workspacePath && normalizeWorkspacePath(workspacePath) !== normalizeWorkspacePath(basedOnResult.executionRoot)) throw new Error("The execution folder does not match the source project result.");
    projectId = basedOnResult.projectId; workspaceId = basedOnResult.workspaceId; workspacePath = basedOnResult.executionRoot;
  }`);
f=f.replace('    archived_at: null,','    archived_at: null,\n    based_on_result_id: basedOnResult?.id || null,');f=f.replace('created_at, updated_at, kind)\n    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, ?, ?, ?)', 'created_at, updated_at, kind, based_on_result_id)\n    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, ?, ?, ?, ?)');f=f.replace('thread.parent_id, thread.fork_id, thread.created_at, thread.updated_at, thread.kind,', 'thread.parent_id, thread.fork_id, thread.created_at, thread.updated_at, thread.kind, thread.based_on_result_id,');s=s.slice(0,fstart)+f+s.slice(fend);write('electron/store.cjs',s);
s=read('src/vite-env.d.ts');s=s.replace('createResearchThread: (input: { projectId?: string;', 'createResearchThread: (input: { basedOnResultId?: string; projectId?: string;');s=s.replace('interface ResearchThread {','interface ResearchThread {\n  based_on_result_id?: string | null;');write('src/vite-env.d.ts',s);
// Analysis naming is this producer's responsibility; chart/figure naming is separate.
write('src/sidebar-registry.tsx',read('src/sidebar-registry.tsx').replace('labelKey: "Data analysis", titleKey: "Data analysis"','labelKey: "Analyze my data", titleKey: "Analyze my data"'));
write('shared/research-apps.json',read('shared/research-apps.json').replace('"data-analysis": { "category":', '"data-analysis": { "legacyLabel": "Data analysis", "category":'));
// Only the analysis owner's translations, retaining the existing shard headers.
const keys={ 'app.ts':['Analyze my data','Select a project before continuing the analysis.','The analysis session does not match its project workspace.','Return to the analysis data folder before attaching its source.','The saved source does not match this analysis workspace.','Complete original dataset. Workspace tools can read this file; the message contains only a summary and sample.'] };
for (const [file,wanted] of Object.entries(keys)) {
 const path='src/i18n/translations/'+file,previous=read(path),prefix=previous.slice(0,previous.indexOf('\n  "'));
 const lines=previous.split('\n').filter(l=>/^  "/.test(l)), additions=old(path).split('\n').filter(l=>wanted.some(k=>l.startsWith('  "'+k+'":')));
 if(additions.length!==wanted.length)throw Error('missing translation '+file);
 write(path,prefix+'\n'+[...lines,...additions].sort((a,b)=>a.split('"',2)[1].toLowerCase().localeCompare(b.split('"',2)[1].toLowerCase(),'en')).join('\n')+'\n};\n');
}
write('src/i18n/translations/dataAnalysis.ts',old('src/i18n/translations/dataAnalysis.ts'));
write('src/DataAnalysisView.tsx',read('src/DataAnalysisView.tsx').replace('file: "plot.svg",  ','file: "plot.svg"'));
