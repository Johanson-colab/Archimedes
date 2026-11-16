import { useEffect, useRef, useState } from 'react';
import { Dialog } from './Dialog';
import { useUISettings } from './i18n';
import { DEFAULT_TRANSFER_SELECTION, type ProjectTransferBridge, type ProjectTransferPreview, type ProjectTransferSelection } from './project-transfer';
import './project-transfer.css';

const categories = [
  ['pdfs', 'Library PDFs and indexed text'], ['annotations', 'Annotations'],
  ['reports', 'Reviews and presentations'], ['conversations', 'Conversations'],
  ['results', 'Analysis and figure packages'], ['artifacts', 'Conversation artifacts'],
  ['reproductions', 'Reproduction history'],
] as const;
const counts = [
  ['papers', 'Papers'], ['paper_highlights', 'Annotations'], ['research_threads', 'Conversations'],
  ['project_results', 'Analysis and figure packages'], ['reproductions', 'Reproduction history'], ['review_runs', 'Review runs'],
  ['metric_comparisons', 'Numerical comparisons'],
] as const;
const bytes = (value: number) => `${(value / (1024 * 1024)).toFixed(2)} MiB`;

export default function ProjectTransferDialog({ bridge, project, dataRoot = '', onClose, onImported }: {
  bridge: Partial<ProjectTransferBridge>; project: ResearchProject; dataRoot?: string;
  onClose: () => void; onImported?: (project: ResearchProject) => void;
}) {
  const { t } = useUISettings();
  const [tab, setTab] = useState<'export' | 'restore'>('export');
  const [selection, setSelection] = useState<ProjectTransferSelection>({ ...DEFAULT_TRANSFER_SELECTION, sourceFiles: [] });
  const [preview, setPreview] = useState<ProjectTransferPreview | null>(null);
  const [inspected, setInspected] = useState<ProjectTransferPreview | null>(null);
  const [restoreName, setRestoreName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setPreview(null); setInspected(null); setSelection({ ...DEFAULT_TRANSFER_SELECTION, sourceFiles: [] }); setBusy(false); setError(''); setMessage('');
    return () => { generation.current++; };
  }, [dataRoot, project.id]);
  const run = async (action: (current: () => boolean) => Promise<void>) => {
    const owner = generation.current; setBusy(true); setError(''); setMessage('');
    const current = () => generation.current === owner;
    try { await action(current); } catch (failure) { if (current()) setError((failure instanceof Error ? failure.message : String(failure)).replace(/^Error invoking remote method '[^']+':\s*/i, '').replace(/^Error:\s*/i, '')); }
    finally { if (current()) setBusy(false); }
  };
  const chooseSources = (mode: 'files' | 'folder') => run(async current => {
    if (!bridge.chooseProjectTransferSources) throw new Error(t('Project transfer requires the desktop app.'));
    const result = await bridge.chooseProjectTransferSources(project.id, mode);
    if (!current() || result.canceled) return;
    setSelection(previous => ({ ...previous, sourceFiles: [...new Map([...previous.sourceFiles, ...result.files].map(file => [`${file.workspaceId}:${file.threadId || ''}:${file.path}`, file])).values()] }));
    setPreview(null);
    if (result.excluded) setMessage(t('{count} configuration, cache or linked entries excluded.', { count: result.excluded }));
  });
  const renderPreview = (value: ProjectTransferPreview) => <section className="project-transfer-preview" aria-label={t('Package contents')}>
    <p><strong>{value.name}</strong> · {t('{count} files', { count: value.fileCount })} · {bytes(value.totalBytes)}</p>
    <dl>{counts.filter(([table]) => value.counts[table]).map(([table, label]) => <div key={table}><dt>{t(label)}</dt><dd>{value.counts[table]}</dd></div>)}</dl>
    <details><summary>{t('Files and SHA-256 hashes')}</summary><ul>{value.files.map((file, index) => <li key={`${file.root}:${file.path}:${index}`}><span>{file.path}</span><code title={file.sha256}>{file.sha256.slice(0, 16)}</code></li>)}</ul></details>
    {value.unavailable.length > 0 && <div className="project-transfer-unavailable" role="status"><strong>{t('Unavailable resources are not included')}</strong><ul>{value.unavailable.map((file, index) => <li key={index}>{file.path}: {file.reason}</li>)}</ul></div>}
  </section>;
  return <Dialog open onClose={() => { if (!busy) onClose(); }} size="lg" ariaLabel={t('Transfer project')} className="project-transfer-dialog">
    <header><h2>{t('Transfer project')}</h2><p>{project.name}</p></header>
    {!bridge.previewProjectPackage && <p role="status">{t('Project transfer requires the desktop app.')}</p>}
    <div className="project-transfer-tabs" role="tablist" aria-label={t('Transfer direction')}>
      <button type="button" role="tab" aria-selected={tab === 'export'} disabled={busy} onClick={() => setTab('export')}>{t('Export project folder')}</button>
      <button type="button" role="tab" aria-selected={tab === 'restore'} disabled={busy} onClick={() => setTab('restore')}>{t('Restore project folder')}</button>
    </div>
    {tab === 'export' ? <section>
      <p>{t('Project and literature metadata are always included. Choose the research contents to copy.')}</p>
      <fieldset disabled={busy}><legend>{t('Include in package')}</legend>{categories.map(([key, label]) => <label key={key}><input type="checkbox" checked={selection[key]} onChange={event => { setSelection(value => ({ ...value, [key]: event.target.checked })); setPreview(null); }} />{t(label)}</label>)}</fieldset>
      <div className="project-transfer-actions"><button type="button" disabled={busy} onClick={() => void chooseSources('files')}>{t('Add source files')}</button><button type="button" disabled={busy} onClick={() => void chooseSources('folder')}>{t('Add manuscript folder')}</button></div>
      {selection.sourceFiles.length > 0 && <details><summary>{t('{count} selected source files', { count: selection.sourceFiles.length })}</summary><ul>{selection.sourceFiles.map(file => <li key={`${file.workspaceId}:${file.threadId || ''}:${file.path}`}>{file.path}<button type="button" disabled={busy} aria-label={t('Remove source file')} onClick={() => { setSelection(value => ({ ...value, sourceFiles: value.sourceFiles.filter(item => item !== file) })); setPreview(null); }}>×</button></li>)}</ul></details>}
      <p className="project-transfer-note">{t('Credentials, configuration, runtime caches, pending approvals and cloud sharing permissions are excluded. Selected research text is copied as written.')}</p>
      <p className="project-transfer-note">{t('Source files are copied from disk. Save editor drafts before exporting.')}</p>
      <div className="project-transfer-actions"><button type="button" disabled={busy || !bridge.previewProjectPackage} onClick={() => void run(async current => { const value = await bridge.previewProjectPackage!(project.id, selection); if (current()) setPreview(value); })}>{t('Preview package')}</button>
        <button type="button" className="primary-button" disabled={busy || !preview || !bridge.exportProjectPackage} onClick={() => void run(async current => { const result = await bridge.exportProjectPackage!(project.id, selection); if (current() && !result.canceled && result.package) { setPreview(result.package); setMessage(t('Project package saved to {path}', { path: result.package.path || '' })); } })}>{t('Choose destination and export')}</button></div>
      {preview && renderPreview(preview)}
    </section> : <section>
      <p>{t('Restore creates a new local project and a new folder. Existing projects and files are kept. Sharing must be enabled again explicitly.')}</p>
      <button type="button" disabled={busy || !bridge.inspectProjectPackage} onClick={() => void run(async current => { const result = await bridge.inspectProjectPackage!(); if (current() && !result.canceled && result.package) { setInspected(result.package); setRestoreName(result.package.name); } })}>{t('Choose package and verify')}</button>
      {inspected && <><label className="project-transfer-name">{t('Restored project name')}<input value={restoreName} disabled={busy} onChange={event => setRestoreName(event.target.value)} maxLength={100} /></label>{renderPreview(inspected)}
        <p className="project-transfer-note">{t('Running work becomes interrupted history. It cannot resume an old process, approval, container or remote session.')}</p>
        <button type="button" className="primary-button" disabled={busy || !restoreName.trim() || !bridge.importProjectPackage} onClick={() => void run(async current => { const result = await bridge.importProjectPackage!({ packagePath: inspected.path!, name: restoreName }); if (current() && !result.canceled && result.project) { setMessage(t('Restored as a new local project: {name}', { name: result.project.name })); onImported?.(result.project); } })}>{t('Choose folder and restore')}</button></>}
    </section>}
    {error && <p role="alert" className="project-transfer-error">{t(error)}</p>}{message && <p role="status">{message}</p>}
    <footer><span>{busy ? t('Working…') : ''}</span><button type="button" disabled={busy} onClick={onClose}>{t('Close')}</button></footer>
  </Dialog>;
}
