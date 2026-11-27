from pathlib import Path
import subprocess,re
w=Path('/Users/fei/Desktop/Archimedes-pr-splits/bibtex-interchange')
def source(p):return subprocess.check_output(['git','show',f'f6b5ee3:{p}'],cwd=w,text=True)
s=source('electron/library-records.cjs');a=s.index('function getSelection');b=s.index('function bibliography');s=s[:a]+s[b:];s=s.replace('getSelection, saveSelection, ','');(w/'electron/bibliography-records.cjs').write_text(s)
for p in ['src/bibliography.ts','src/BibliographyDialog.tsx']:(w/p).write_text(source(p))
p=w/'src/LibraryWorkspace.tsx';# the historical diff in this file is bibliography-only
p.write_text(source('src/LibraryWorkspace.tsx'))
p=w/'electron/store.cjs';s=p.read_text().replace('const librarySeeds =','const bibliographyRecords = require("./bibliography-records.cjs");\nconst librarySeeds =',1)
s=s.replace('    CREATE TABLE IF NOT EXISTS paper_reader_assets (', '''    CREATE TABLE IF NOT EXISTS paper_bibliography (
      paper_id TEXT PRIMARY KEY NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      citekey TEXT NOT NULL DEFAULT '',
      entry_type TEXT NOT NULL DEFAULT 'article',
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS paper_reader_assets (''',1)
a=s.index('function canonicalPaperKey(');b=s.index('\nfunction ',a+1);f=source('electron/store.cjs');fa=f.index('function canonicalPaperKey(');fb=f.index('\nfunction ',fa+1);s=s[:a]+f[fa:fb].replace('libraryRecords','bibliographyRecords')+s[b:]
s=s.replace('  const state = paperUserState(row.id);\n  return {','  const state = paperUserState(row.id);\n  const bibliography = bibliographyRecords.bibliography(requireDatabase(), row.id);\n  return {',1).replace('    state_updated_at: state?.updated_at ?? null,','    state_updated_at: state?.updated_at ?? null,\n    citekey: bibliography.citekey,\n    entry_type: bibliography.entryType,',1)
s=s.replace('  const existing = db.prepare("SELECT id FROM papers WHERE canonical_key = ?").get(key);','  const existing = bibliographyRecords.findImportMatch(db, paper, key, { libraryId: library.id, projectId: library.project_id });',1)
fa=f.index('  } else {\n    const fields = ["venue", "abstract",',f.index('function addPaperRecord'));fb=f.index('\n  db.prepare(`\n    INSERT OR IGNORE INTO paper_user_state',fa);replacement=f[fa:fb];marker='\n  db.prepare(`\n    INSERT OR IGNORE INTO paper_user_state';a=s.index(marker,s.index('function addPaper('));s=s[:a-4]+replacement+s[a:]
s=s.replace('UPDATE papers SET conference_json = ?, venue = ?, year = ?,','UPDATE papers SET conference_json = CASE WHEN conference_json IS NULL OR conference_json IN (\'\', \'null\') THEN ? ELSE conference_json END, venue = CASE WHEN venue = \'\' THEN ? ELSE venue END, year = COALESCE(year, ?),',1)
fa=f.index('function getPaperBibliography(');fb=f.index('\nfunction linkLibraryToCloud',fa);s=s.replace('\nfunction linkLibraryToCloud', '\n'+f[fa:fb].replace('libraryRecords','bibliographyRecords')+'\nfunction linkLibraryToCloud',1)
s=s.replace('module.exports = {','module.exports = {\n  getPaperBibliography,\n  setPaperBibliography,\n  repairLibraryPaperMetadata,',1);p.write_text(s)
p=w/'electron/main.cjs';s=p.read_text();marker='  ipcMain.handle("library:import-local-pdf",';s=s.replace(marker,'  ipcMain.handle("library:get-bibliography", (_event, { paperId }) => store.getPaperBibliography(paperId));\n  ipcMain.handle("library:set-bibliography", (_event, { paperId, patch }) => store.setPaperBibliography(paperId, patch));\n  ipcMain.handle("library:repair-metadata", (_event, { paperId, patch }) => store.repairLibraryPaperMetadata(paperId, patch));\n\n'+marker,1);p.write_text(s)
p=w/'electron/preload.cjs';s=p.read_text().replace('  updateLibraryPaper:', '  getPaperBibliography: (paperId) => ipcRenderer.invoke("library:get-bibliography", { paperId }),\n  setPaperBibliography: (paperId, patch) => ipcRenderer.invoke("library:set-bibliography", { paperId, patch }),\n  repairLibraryPaperMetadata: (paperId, patch) => ipcRenderer.invoke("library:repair-metadata", { paperId, patch }),\n  updateLibraryPaper:',1);p.write_text(s)
p=w/'src/vite-env.d.ts';s=p.read_text();s=s.replace('    updateLibraryPaper:', '    getPaperBibliography: (paperId: string) => Promise<{ paper_id: string; citekey: string; entryType: string; updated_at: string | null }>;\n    setPaperBibliography: (paperId: string, patch: { citekey?: string; entryType?: string }) => Promise<{ paper_id: string; citekey: string; entryType: string; updated_at: string | null }>;\n    repairLibraryPaperMetadata: (paperId: string, patch: import("./bibliography").MetadataPatch) => Promise<LibraryPaper>;\n    updateLibraryPaper:',1)
a=s.index('interface LibraryPaper');b=s.index('\n}',a);s=s[:b]+'\n  citekey?: string;\n  entry_type?: string;'+s[b:];p.write_text(s)
p=w/'src/library-preview.ts';s=p.read_text();f=source('src/library-preview.ts');s='import { matchBibliographyPaper, type MetadataPatch } from "./bibliography";\n'+s
a=s.index('    const existing =',s.index('  addLibraryPaper:'));b=s.index('\n    const id =',a);s=s[:a]+'    const existing = matchBibliographyPaper(paper, [...previewPapers.values()]);'+s[b:]
a=f.index('  getPaperBibliography:');b=f.index('  updateLibraryPaper:',a);s=s.replace('  updateLibraryPaper:',f[a:b]+'  updateLibraryPaper:',1);p.write_text(s)
p=w/'src/i18n/translations/library.ts';lines=p.read_text().splitlines();keys=['BibTeX export preview','BibTeX interchange','BibTeX source','Choose a BibTeX file','Citation key conflict: edit the source before importing','Download BibTeX','Duplicate in this import','Existing paper','Existing paper with metadata differences','Import selected references','Imported','New paper','Preview BibTeX export','Preview first. Existing metadata, PDF files and personal notes are kept unless you explicitly select metadata repairs.','Repair selected metadata','Replace citation key explicitly'];add=[x for x in source('src/i18n/translations/library.ts').splitlines() if any(x.startswith('  "'+k+'":') for k in keys)]
for x in add:
 key=x.split('"',2)[1].lower();idx=next((i for i,line in enumerate(lines) if line.startswith('  "') and line.split('"',2)[1].lower()>key),len(lines)-1);lines.insert(idx,x)
p.write_text('\n'.join(lines)+'\n')
