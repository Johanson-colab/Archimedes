const fs = require('node:fs'), cp = require('node:child_process');
const dir = '/Users/fei/Desktop/Archimedes-pr-splits/files-owner-saves';
const old = cp.execFileSync('git',['show','f6b5ee3:src/App.tsx'],{cwd:dir,encoding:'utf8'});
const fn = (source,name) => {
 const start=source.search(new RegExp('^  (?:async )?function '+name+'\\(', 'm'))+2;
 if(start<2) throw new Error('missing '+name);
 const offset=source.slice(start).search(/\n  }(?=\n)/);
 if(offset<0) throw new Error('missing function end '+name);
 const end=start+offset+4;
 return {start,end,text:source.slice(start,end)};
};
let source = fs.readFileSync(dir+'/src/App.tsx','utf8');
const oldImport=old.split('\n').find(l=>l.includes('from "./file-editor";'));
source=source.replace(source.split('\n').find(l=>l.includes('from "./file-editor";')),oldImport);
source=source.replace('  const [fileDrafts, setFileDrafts] = useState<Record<string, FileDraft>>({});\n  const [fileSaving, setFileSaving] = useState<Set<string>>(new Set());\n  const [fileConflicts, setFileConflicts] = useState<Record<string, string>>({});\n  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});','  const [fileEditorScopes, setFileEditorScopes] = useState<FileEditorScopes>({});');
source=source.replace('  const fileDraftsRef = useRef<Record<string, FileDraft>>({});\n  const fileSavingRef = useRef<Set<string>>(new Set());','  const fileEditorScopesRef = useRef<FileEditorScopes>({});');
source=source.replace('  executionWorkspaceRef.current = executionWorkspace;',`  const fileWorkspaceVersionRef = useRef(0);
  if (executionWorkspaceRef.current !== executionWorkspace) fileWorkspaceVersionRef.current += 1;
  executionWorkspaceRef.current = executionWorkspace;
  const fileWorkspaceVersion = fileWorkspaceVersionRef.current;
  const fileEditorScope = getFileEditorScope(fileEditorScopes, executionWorkspace);
  const { drafts: fileDrafts, saving: fileSaving, conflicts: fileConflicts, errors: fileErrors } = fileEditorScope;`);
source=source.replaceAll('Object.values(fileDraftsRef.current).some(isDraftDirty)','hasDirtyFileEditorScopes(fileEditorScopesRef.current)');
source=source.replace('    setDrafts({});\n    fileSavingRef.current = new Set();\n    setFileSaving(new Set());\n    setFileConflicts({});\n    setFileErrors({});','    replaceFileEditorScopes({});');
const helperNames=['replaceFileEditorScopes','isCurrentFileWorkspace','updateFileScope','setFileConflicts','setFileErrors'];
source=source.replace('  function setDrafts(',helperNames.map(name=>'  '+fn(old,name).text).join('\n\n')+'\n\n  function setDrafts(');
for(const name of ['setDrafts','setFileSavingPath','ensureFileDraft','refreshWorkspaceFiles','loadWorkspaceDirectory','openFilePane','openChangedFile','closeFilePane','closeOtherFilePanes','closeAllFilePanes','updateFileDraft','saveFile','reloadFile','dismissFileConflict']) {
 const current=fn(source,name);
 source=source.slice(0,current.start)+fn(old,name).text+source.slice(current.end);
}
source=source.replace('    openFilesRef.current = [];\n    setOpenFiles([]);\n    setSelectedFilePath(null);\n    setSelectedFile(null);\n    setFileError("");\n    void refreshWorkspaceFiles();','    openFilesRef.current = [];\n    setOpenFiles([]);\n    setSelectedFilePath(null);\n    setSelectedFile(null);\n    setFileError("");\n    setFileLoading(false);\n    setDirectoryRequest(null);\n    setLoadingDirectories(new Set());\n    void refreshWorkspaceFiles();');
fs.writeFileSync(dir+'/src/App.tsx',source);
for(const file of ['src/file-editor.ts','electron/file-editor-scope.test.cjs']) fs.writeFileSync(dir+'/'+file,cp.execFileSync('git',['show','f6b5ee3:'+file],{cwd:dir,encoding:'utf8'}));
let test=cp.execFileSync('git',['show','f6b5ee3:electron/workspace-directory-link.test.cjs'],{cwd:dir,encoding:'utf8'});
test=test.replaceAll('\\n  async function openManuscriptChat(','\\n  function askAIAboutPaper(');
fs.writeFileSync(dir+'/electron/workspace-directory-link.test.cjs',test);
