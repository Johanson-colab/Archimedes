from pathlib import Path
import subprocess,re
w=Path('/Users/fei/Desktop/Archimedes-pr-splits/discovery-project-state')
def source(p,rev='f6b5ee3'):return subprocess.check_output(['git','show',f'{rev}:{p}'],cwd=w,text=True)
helper=source('src/discovery-state.ts');helper=helper[helper.index('export type DiscoverySnapshot'):helper.index('export function discoveryProvenance')];helper=helper.replace('  reasons: Record<string, string>;\n','').replace('reasons: saved.reasons || {}, ','')
(w/'src/discovery-state.ts').write_text(helper)
p=w/'src/LibraryView.tsx';s=p.read_text();final=source('src/LibraryView.tsx')
s=s.replace('import ConferenceDiscovery from "./ConferenceDiscovery";', 'import ConferenceDiscovery from "./ConferenceDiscovery";\nimport { discoveryPaperKey, discoveryStorageKey, readDiscoverySnapshot, writeDiscoverySnapshot } from "./discovery-state";')
s=s.replace('  workspace?: string;\n  active?: boolean;', '  workspace?: string;\n  dataRoot?: string;\n  active?: boolean;')
s=s.replace('workspace = "", active = true, projectId,','workspace = "", dataRoot = workspace, active = true, projectId,',1)
s=s.replace('return <DailyLibraryView key={projectId || "local"} bridge=', 'return <DailyLibraryView key={discoveryStorageKey(dataRoot, projectId)} dataRoot={dataRoot} bridge=',1)
s=s.replace('function DailyLibraryView({ bridge, projectId,','function DailyLibraryView({ bridge, dataRoot, projectId,',1)
s=s.replace('  bridge: ResearchDeskBridge; projectId?: string | null; initialMode?:', '  dataRoot: string; bridge: ResearchDeskBridge; projectId?: string | null; initialMode?:',1)
s=s.replace('return <DailyDiscovery initialMode=', 'return <DailyDiscovery storageKey={discoveryStorageKey(dataRoot, projectId)} projectId={projectId} initialMode=',1)
start=final.index('function DailyDiscovery(');end=final.index('\nfunction DailyPaperPreview',start);daily=final[start:end]
daily=daily.replace('  const [reasons, setReasons] = useState<Record<string, string>>(saved?.reasons || {});\n','').replace(', deepResponse, reasons',', deepResponse')
daily=re.sub(r'      await \(bridge as SelectionBridge\)\.addLibraryPaper\([\s\S]*?      \} : undefined\);','      await bridge.addLibraryPaper(targetLibraryId, paper);',daily,count=1)
daily=re.sub(r' reasons=\{reasons\} onReason=\{\(key, reason\) => setReasons\(\(current\) => \(\{ \.\.\.current, \[key\]: reason \}\)\)\}', '', daily)
daily='\n'.join(line for line in daily.splitlines() if '<label>{t("Project selection reason")}' not in line)+'\n'
daily=daily.replace(' storageKey={`${storageKey}:conference`} projectId={projectId}', ' storageKey={`${storageKey}:conference`}')
start=s.index('function DailyDiscovery(');end=s.index('\nfunction DailyPaperPreview',start);s=s[:start]+daily+s[end:]
# Canonical identities make an already collected result recognisable after reopening.
start=s.index('\nfunction DeepSearchResults');s=s[:start]+s[start:].replace('const key = paper.external_id || paper.title;', 'const key = discoveryPaperKey(paper);')
p.write_text(s)
s=source('src/ConferenceDiscovery.tsx');s=s.replace(', type SelectionBridge','').replace('{ storageKey, projectId, bridge,','{ storageKey, bridge,').replace('storageKey?: string; projectId?: string | null;','storageKey?: string;')
s=s.replace('  const [reasons, setReasons] = useState<Record<string, string>>(saved?.reasons || {});\n','').replace(' }, reasons }',' } }').replace(', response, reasons, t]',', response, t]')
s=re.sub(r'      await \(bridge as SelectionBridge\)\.addLibraryPaper\([\s\S]*?      \} : undefined\);','      await bridge.addLibraryPaper(targetLibraryId, paper);',s,count=1)
s='\n'.join(line for line in s.splitlines() if '<label>{t("Project selection reason")}' not in line)+'\n';(w/'src/ConferenceDiscovery.tsx').write_text(s)
p=w/'src/library-workspace.css';s=p.read_text();s+='\n.daily-create-library { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; margin-block: 10px; }\n.daily-create-library label { display: grid; gap: 5px; }\n.daily-create-library input { min-width: 0; padding: 7px 9px; color: var(--text-primary); background: var(--surface-control); border: 1px solid var(--border-soft); border-radius: 5px; }\n';p.write_text(s)
p=w/'src/i18n/translations/library.ts';lines=p.read_text().splitlines();keys=['Create library here','Discovery could not be saved on this device. Keep this page open or free storage before leaving.','Library name','New discovery library'];add=[x for x in source('src/i18n/translations/library.ts').splitlines() if any(x.startswith('  "'+k+'":') for k in keys)]
for x in add:
 key=x.split('"',2)[1].lower();idx=next((i for i,line in enumerate(lines) if line.startswith('  "') and line.split('"',2)[1].lower()>key),len(lines)-1);lines.insert(idx,x)
p.write_text('\n'.join(lines)+'\n')
