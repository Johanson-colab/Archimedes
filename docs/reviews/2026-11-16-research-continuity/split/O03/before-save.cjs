const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
(async () => {
 const repo='/Users/fei/Desktop/Archimedes-pr-splits/product-baseline';
 const helpers=await import(repo+'/src/file-editor.ts');
 const {writeWorkspaceTextFile,readWorkspaceFile}=require(repo+'/electron/workspace-files.cjs');
 const source=fs.readFileSync(repo+'/src/App.tsx','utf8');
 const start=source.indexOf('  async function saveFile('), end=source.indexOf('\n  async function reloadFile(',start);
 const {transformWithOxc}=await import('/Users/fei/Desktop/Archimedes/node_modules/vite/dist/node/index.js');
 const {code}=await transformWithOxc(source.slice(start,end),'base-save.tsx');
 const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'file-save-base-'))),a=path.join(directory,'a'),b=path.join(directory,'b');
 fs.mkdirSync(a);fs.mkdirSync(b);fs.writeFileSync(path.join(a,'notes.md'),'Original A\n');fs.writeFileSync(path.join(b,'notes.md'),'Original B\n');
 let release;
 const scope={...helpers,executionWorkspace:a,fileDraftsRef:{current:{}},openFilesRef:{current:[]},
 setFileSavingPath(){},setFileErrors(){},setFileConflicts(){},setOpenFiles(){},setSelectedFile(){},
 setDrafts(next){scope.fileDraftsRef.current=next;},
 desktopBridge:{writeWorkspaceFile:async(...args)=>{await new Promise(resolve=>{release=resolve;});return writeWorkspaceTextFile(...args);}}};
 const save=new Function('scope',`with(scope){${code};return saveFile;}`)(scope);
 scope.fileDraftsRef.current={'notes.md':{...helpers.createFileDraft(readWorkspaceFile(a,'notes.md')),content:'Submitted A\n'}};
 const saving=save('notes.md');
 scope.executionWorkspace=b;scope.fileDraftsRef.current={'notes.md':{...helpers.createFileDraft(readWorkspaceFile(b,'notes.md')),content:'Unsaved B\n'}};
 release();await saving;
 console.log('Untouched upstream 1f4b375 actual save callback:');
 console.log('A disk:',JSON.stringify(fs.readFileSync(path.join(a,'notes.md'),'utf8')));
 console.log('B disk:',JSON.stringify(fs.readFileSync(path.join(b,'notes.md'),'utf8')));
 console.log('Current B buffer savedContent:',JSON.stringify(scope.fileDraftsRef.current['notes.md'].savedContent));
 fs.rmSync(directory,{recursive:true,force:true});
 assert.equal(scope.fileDraftsRef.current['notes.md'].savedContent,'Original B\n');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
