import { useEffect, useMemo, useRef, useState } from 'react';
import { useUISettings } from './i18n';
import type { MetricComparison, MetricComparisonBridge, MetricComparisonSummary, MetricInput, MetricMapping, MetricRow } from './metric-comparison';
import './metric-comparison.css';

const labels: Record<MetricRow['status'], string> = { missing: 'Missing value', incomparable: 'Incomparable', within: 'Within tolerance', outside: 'Outside tolerance' };
const emptyMapping: MetricMapping = { expectedColumn: '', actualColumn: '', unitValue: '', datasetValue: '', absoluteTolerance: 0 };
export default function MetricComparisonPanel({ bridge, record, run, projectId, workspaceId, ownerKey = '' }: {
  bridge: Partial<MetricComparisonBridge>; record: Reproduction; run: ReproductionRun | null;
  projectId?: string | null; workspaceId?: string | null; ownerKey?: string;
}) {
  const { t } = useUISettings();
  const [input, setInput] = useState<MetricInput | null>(null), [mapping, setMapping] = useState<MetricMapping>(emptyMapping);
  const [title, setTitle] = useState(''), [tolerance, setTolerance] = useState('0'), [confirmed, setConfirmed] = useState(false);
  const [history, setHistory] = useState<MetricComparisonSummary[]>([]), [detail, setDetail] = useState<MetricComparison | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [page, setPage] = useState(0);
  const generation = useRef(0), operation = useRef(0), busyRef = useRef(false);
  const detailId = useRef<string | null>(null); detailId.current = detail?.id || null;
  const available = Boolean(run && record.project_id && record.workspace_id && record.execution_root && run.reproduction_id === record.id && (!projectId || projectId === record.project_id) && (!workspaceId || workspaceId === record.workspace_id));
  const context = { reproductionId: record.id, runId: run?.id || '' };
  const selectionKey = JSON.stringify([ownerKey, record.id, record.project_id, record.workspace_id, record.execution_root, run?.id]);
  const runFingerprint = useMemo(() => JSON.stringify(run?.snapshot || null), [run?.snapshot]);
  useEffect(() => {
    generation.current++;
    detailId.current = null;
    operation.current++; busyRef.current = false; setBusy(false); setInput(null); setMapping(emptyMapping); setConfirmed(false); setDetail(null); setHistory([]); setError(''); setPage(0); setTolerance('0'); setTitle(record.title);
    return () => { generation.current++; operation.current++; };
  }, [selectionKey]);
  useEffect(() => {
    const version = generation.current, id = detailId.current;
    if (!available || !bridge.listMetricComparisons) return;
    void bridge.listMetricComparisons(context).then(values => { if (generation.current === version) setHistory(values); }).catch(failure => { if (generation.current === version) setError(String(failure)); });
    if (id && bridge.getMetricComparison) void bridge.getMetricComparison({ ...context, comparisonId: id }).then(value => { if (generation.current === version && detailId.current === id) setDetail(value); }).catch(failure => { if (generation.current === version) setError(String(failure)); });
  }, [selectionKey, runFingerprint]);
  const act = async (action: (current: () => boolean) => Promise<void>) => {
    if (busyRef.current) return;
    const version = generation.current, sequence = ++operation.current;
    const current = () => generation.current === version && operation.current === sequence;
    busyRef.current = true; setBusy(true); setError('');
    try { await action(current); } catch (failure) { if (current()) setError((failure instanceof Error ? failure.message : String(failure)).replace(/^Error invoking remote method '[^']+':\s*/i, '').replace(/^Error:\s*/i, '')); }
    finally { if (current()) { busyRef.current = false; setBusy(false); } }
  };
  const change = <K extends keyof MetricMapping>(key: K, value: MetricMapping[K]) => { setMapping(previous => ({ ...previous, [key]: value })); setConfirmed(false); };
  const column = (label: string, key: keyof MetricMapping, none: string) => <label>{t(label)}<select disabled={busy} value={String(mapping[key] || '')} onChange={event => change(key, event.target.value)}><option value="">{t(none)}</option>{input?.headers.map(header => <option key={header} value={header}>{header}</option>)}</select></label>;
  const choose = () => act(async current => {
    const chosen = await bridge.chooseMetricComparisonInput!(context);
    if (!current() || chosen.canceled || !chosen.input) return;
    const source = chosen.input, find = (...names: string[]) => source.headers.find(header => names.includes(header.toLowerCase())) || '';
    setInput(source); setDetail(null); setPage(0); setConfirmed(false);
    setMapping({ ...emptyMapping, expectedColumn: find('expected'), actualColumn: find('actual'), metricColumn: find('metric', 'claim'), unitColumn: find('unit'), datasetColumn: find('dataset'), toleranceColumn: find('tolerance') });
  });
  const save = () => act(async current => {
    if (!input || !confirmed || !mapping.toleranceColumn && !tolerance.trim()) return;
    const value = await bridge.saveMetricComparison!({ ...context, inputToken: input.token, title, mapping: { ...mapping, absoluteTolerance: mapping.toleranceColumn ? '0' : tolerance } });
    if (!current()) return;
    setDetail(value); setPage(0);
    const history = await bridge.listMetricComparisons!(context);
    if (current()) setHistory(history);
  });
  const refresh = () => act(async current => {
    const values = await bridge.listMetricComparisons!(context);
    if (current()) setHistory(values);
    if (detail) { const value = await bridge.getMetricComparison!({ ...context, comparisonId: detail.id }); if (current()) setDetail(value); }
  });
  const exportJson = () => {
    if (!detail) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `metric-comparison-${detail.id}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const validTolerance = Boolean(mapping.toleranceColumn) || /^\+?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(tolerance.trim());
  const usable = Boolean(bridge.chooseMetricComparisonInput && bridge.saveMetricComparison && bridge.listMetricComparisons && bridge.getMetricComparison);
  return <section className="metric-comparison-panel" aria-label={t('Numerical comparisons')}>
    <header><h3>{t('Numerical comparisons')}</h3><p>{t('Choose a CSV or JSON file, map its columns, and save a numerical comparison.')}</p></header>
    {!available && <p>{t('Select a recorded run bound to this project workspace to compare numbers.')}</p>}
    {!usable && <p>{t('Numerical comparisons require the desktop app.')}</p>}
    {available && usable && <>
      <div className="metric-comparison-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => void choose()}>{t('Choose CSV or JSON data')}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void refresh()}>{t('Refresh comparison history')}</button></div>
      {input && <div className="metric-comparison-input">
        <p><strong>{input.name}</strong> · {t('{count} metric rows', { count: input.rowCount })} · <code title={input.sha256}>{input.sha256.slice(0, 16)}</code></p>
        <details><summary>{t('Preview selected data')}</summary><div className="metric-comparison-table"><table><thead><tr>{input.headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{input.preview.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div></details>
        <label>{t('Comparison title')}<input value={title} disabled={busy} maxLength={300} onChange={event => setTitle(event.target.value)} /></label>
        <div className="metric-comparison-mapping">
          {column('Metric or claim column', 'metricColumn', 'Use row numbers')}
          {column('Expected value column', 'expectedColumn', 'Choose column')}
          {column('Actual value column', 'actualColumn', 'Choose column')}
          {column('Expected unit', 'unitColumn', 'Enter a fixed unit')}
          {!mapping.unitColumn && <label>{t('Fixed unit')}<input disabled={busy} value={mapping.unitValue || ''} placeholder={t('For example: ratio, %, seconds')} onChange={event => change('unitValue', event.target.value)} /></label>}
          {column('Actual unit', 'actualUnitColumn', 'Same confirmed unit')}
          {column('Expected dataset', 'datasetColumn', 'Enter a fixed dataset')}
          {!mapping.datasetColumn && <label>{t('Fixed dataset')}<input disabled={busy} value={mapping.datasetValue || ''} onChange={event => change('datasetValue', event.target.value)} /></label>}
          {column('Actual dataset', 'actualDatasetColumn', 'Same confirmed dataset')}
          {column('Absolute tolerance column', 'toleranceColumn', 'Use fixed absolute tolerance')}
          <label>{t('Fixed absolute tolerance')}<input type="number" min="0" step="any" disabled={busy || Boolean(mapping.toleranceColumn)} value={tolerance} onChange={event => { setTolerance(event.target.value); setConfirmed(false); }} /></label>
        </div>
        <label className="metric-comparison-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />{t('I confirm the expected/actual columns, dataset, unit and absolute tolerance for this comparison.')}</label>
        <button type="button" className="primary-button" disabled={busy || !confirmed || !title.trim() || !mapping.expectedColumn || !mapping.actualColumn || mapping.expectedColumn === mapping.actualColumn || !validTolerance} onClick={() => void save()}>{t('Compare and save')}</button>
      </div>}
      {history.length > 0 && <div className="metric-comparison-history"><h4>{t('Saved comparisons')}</h4>{history.map(item => <button type="button" className="secondary-button" key={item.id} disabled={busy || item.state === 'invalid'} onClick={() => void act(async current => { const value = await bridge.getMetricComparison!({ ...context, comparisonId: item.id }); if (current()) { setDetail(value); setPage(0); } })}>{'title' in item ? item.title : t('Unreadable comparison')} · {t(item.state === 'stale' ? 'Stale evidence' : item.state === 'invalid' ? 'Invalid evidence' : 'Recorded comparison')}</button>)}</div>}
      {detail && <article className="metric-comparison-result">
        <h4>{detail.title}</h4>
        {detail.state === 'stale' && <div role="status" className="metric-comparison-warning"><strong>{t('Stale evidence')}</strong>{detail.reasons.map(reason => <p key={reason}>{t(reason)}</p>)}</div>}
        <dl className="metric-comparison-counts">{(Object.keys(labels) as MetricRow['status'][]).map(status => <div key={status}><dt>{t(labels[status])}</dt><dd>{detail.counts[status]}</dd></div>)}</dl>
        <div className="metric-comparison-table"><table><thead><tr>{['Metric', 'Expected', 'Actual', 'Unit', 'Dataset', 'Absolute tolerance', 'Result'].map(label => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{detail.rows.slice(page * 100, (page + 1) * 100).map(row => <tr key={row.row}><th>{row.metric}</th><td>{row.expectedRaw || '—'}</td><td>{row.actualRaw || '—'}</td><td>{row.expectedUnit === row.actualUnit ? row.expectedUnit : `${row.expectedUnit} ≠ ${row.actualUnit}`}</td><td>{row.expectedDataset === row.actualDataset ? row.expectedDataset : `${row.expectedDataset} ≠ ${row.actualDataset}`}</td><td>{row.tolerance ?? '—'}</td><td><strong>{t(labels[row.status])}</strong><small>{t(row.reason)}</small></td></tr>)}</tbody></table></div>
        {detail.rows.length > 100 && <div className="metric-comparison-actions"><button type="button" className="secondary-button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>{t('Previous')}</button><span>{page + 1} / {Math.ceil(detail.rows.length / 100)}</span><button type="button" className="secondary-button" disabled={(page + 1) * 100 >= detail.rows.length} onClick={() => setPage(value => value + 1)}>{t('Next')}</button></div>}
        <details><summary>{t('Comparison evidence')}</summary><p>{t('Source file')}: {detail.source.path}</p><p>SHA-256: <code>{detail.source.sha256}</code></p><p>{t('Run snapshot SHA-256')}: <code>{detail.runSnapshotSha256 || t('Unknown')}</code></p><p>{t('Source file state')}: {t(detail.sourceState)}</p><p>{t('Run')}: {detail.owner.runId}</p><p>{t('Input saved from the file you selected.')}</p></details>
        <button type="button" className="secondary-button" onClick={exportJson}>{t('Export comparison JSON')}</button>
      </article>}
    </>}
    {error && <p className="metric-comparison-error" role="alert">{t(error)}</p>}
  </section>;
}
