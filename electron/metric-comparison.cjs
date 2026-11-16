const fs = require('node:fs');
const path = require('node:path');
const { isUtf8 } = require('node:buffer');
const { createHash, randomUUID } = require('node:crypto');
const decimal = require('./decimal-comparison.cjs');
const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const digest = data => createHash('sha256').update(data).digest('hex');
const snapshotHash = snapshot => snapshot ? digest(JSON.stringify(snapshot)) : null;
const identifier = value => { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error('Invalid metric comparison identity.'); return value; };

async function parseInput(name, bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length > MAX_INPUT_BYTES) throw new Error('Metric comparison files are limited to 2 MiB.');
  if (!isUtf8(bytes)) throw new Error('Use a UTF-8 CSV or JSON metric file.');
  const text = bytes.toString('utf8').replace(/^\uFEFF/, ''), extension = path.extname(name).toLowerCase();
  let table;
  if (extension === '.csv') table = (await import('../shared/delimited.mjs')).parseDelimited(text, ',');
  else if (extension === '.json') {
    const values = decimal.parseJsonDecimals(text);
    if (!Array.isArray(values) || !values.length || values.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Use a JSON array of flat metric records.');
    const headers = [...new Set(values.flatMap(row => Object.keys(row)))];
    if (headers.some(header => !header.trim())) throw new Error('Metric columns need nonempty names.');
    const rows = values.map(row => headers.map(header => { const value = row[header]; if (value != null && typeof value === 'object') throw new Error('Metric JSON records must contain scalar fields.'); return value == null ? '' : String(value); }));
    table = { headers, rows };
  } else throw new Error('Choose a CSV or JSON metric file.');
  if (table.rows.length > 10000 || table.headers.length > 100) throw new Error('Metric comparison supports at most 10,000 rows and 100 columns.');
  if (new Set(table.headers).size !== table.headers.length) throw new Error('Metric column names must be unique.');
  return { name: path.basename(name), format: extension.slice(1), sha256: digest(bytes), bytes: bytes.length, ...table };
}

function mappingFor(table, input) {
  input ||= {};
  const columns = ['metricColumn', 'expectedColumn', 'actualColumn', 'unitColumn', 'actualUnitColumn', 'datasetColumn', 'actualDatasetColumn', 'toleranceColumn'];
  const mapping = {};
  for (const key of columns) {
    const value = input?.[key];
    if (value && (typeof value !== 'string' || !table.headers.includes(value))) throw new Error('A mapped column is not present in this source file.');
    mapping[key] = value || '';
  }
  if (!mapping.expectedColumn || !mapping.actualColumn || mapping.expectedColumn === mapping.actualColumn) throw new Error('Choose separate expected and actual value columns.');
  for (const key of ['unitValue', 'datasetValue']) mapping[key] = typeof input[key] === 'string' ? input[key].trim().slice(0, 300) : '';
  const tolerance = decimal.parseDecimal(input.absoluteTolerance);
  if (!tolerance || tolerance.coefficient < 0n) throw new Error('Set a supported, nonnegative decimal absolute tolerance.');
  mapping.absoluteTolerance = String(input.absoluteTolerance).trim();
  return mapping;
}
const missing = value => /^(?:|NA|N\/A|NaN|null)$/i.test(value.trim());
function compare(table, input) {
  const mapping = mappingFor(table, input), index = new Map(table.headers.map((header, position) => [header, position]));
  const rows = table.rows.map((values, position) => {
    const cell = column => column ? values[index.get(column)]?.trim() || '' : '';
    const expectedRaw = cell(mapping.expectedColumn), actualRaw = cell(mapping.actualColumn);
    const expected = decimal.parseDecimal(expectedRaw), actual = decimal.parseDecimal(actualRaw);
    const expectedUnit = cell(mapping.unitColumn) || (!mapping.unitColumn ? mapping.unitValue : '');
    const actualUnit = mapping.actualUnitColumn ? cell(mapping.actualUnitColumn) : expectedUnit;
    const expectedDataset = cell(mapping.datasetColumn) || (!mapping.datasetColumn ? mapping.datasetValue : '');
    const actualDataset = mapping.actualDatasetColumn ? cell(mapping.actualDatasetColumn) : expectedDataset;
    const toleranceRaw = mapping.toleranceColumn ? cell(mapping.toleranceColumn) : mapping.absoluteTolerance;
    const tolerance = decimal.parseDecimal(toleranceRaw), difference = expected && actual ? decimal.difference(actual, expected) : null;
    const row = { row: position + 1, metric: cell(mapping.metricColumn) || `Row ${position + 1}`, expectedRaw, actualRaw, expected: expected ? expectedRaw : null, actual: actual ? actualRaw : null, expectedUnit, actualUnit, expectedDataset, actualDataset, tolerance: tolerance ? toleranceRaw : null, difference: difference ? decimal.decimalText(difference) : null, status: 'incomparable', reason: '' };
    if (missing(expectedRaw) || missing(actualRaw)) { row.status = 'missing'; row.reason = 'An expected or actual value is missing.'; }
    else if (!expected || !actual) row.reason = 'Values must use decimal or scientific notation within the supported precision limits.';
    else if (!expectedUnit || !actualUnit || expectedUnit !== actualUnit) row.reason = 'Units are missing or do not match; no conversion is assumed.';
    else if (!expectedDataset || !actualDataset || expectedDataset !== actualDataset) row.reason = 'Datasets are missing or do not match.';
    else if (!tolerance || tolerance.coefficient < 0n) row.reason = 'The absolute tolerance is missing or invalid.';
    else {
      row.status = decimal.lessOrEqual(difference, tolerance) ? 'within' : 'outside';
      row.reason = row.status === 'within' ? 'The absolute difference is within the confirmed tolerance.' : 'The absolute difference exceeds the confirmed tolerance.';
    }
    return row;
  });
  const counts = { missing: 0, incomparable: 0, within: 0, outside: 0 };
  for (const row of rows) counts[row.status]++;
  return { mapping, rows, counts };
}

function scope(input) {
  for (const key of ['projectId', 'workspaceId', 'reproductionId', 'runId']) identifier(input[key]);
  return { dataRoot: fs.realpathSync(input.dataRoot), projectId: input.projectId, workspaceId: input.workspaceId, executionRoot: path.resolve(input.executionRoot), reproductionId: input.reproductionId, runId: input.runId };
}
function receiptPath(owner, id) { return `.archimedes/metric-comparisons/${identifier(owner.runId)}/${identifier(id)}/comparison.json`; }
function metricPath(root, relative, createParents = false) {
  if (!/^\.archimedes\/metric-comparisons\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+(?:\/(?:comparison\.json|source\.(?:csv|json)))?)?$/.test(relative)) throw new Error('Invalid metric evidence path.');
  const parts = relative.split('/'); let current = fs.realpathSync(root);
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink() || index < parts.length - 1 && stat && !stat.isDirectory()) throw new Error('Metric evidence cannot use linked or non-directory parents.');
    if (!stat && createParents && index < parts.length - 1) fs.mkdirSync(current);
  }
  return { target: current };
}
function readFile(root, relative, limit) {
  const { target } = metricPath(root, relative), stat = fs.statSync(target);
  if (!stat.isFile() || stat.size > limit) throw new Error('Invalid metric evidence file size.');
  return fs.readFileSync(target);
}

async function saveComparison({ owner: inputOwner, runSnapshot, sourceName, sourceBytes, originalPath = '', title, mapping }) {
  const owner = scope(inputOwner), input = await parseInput(sourceName, sourceBytes), comparison = compare(input, mapping);
  if (typeof title !== 'string' || !title.trim() || title.length > 300) throw new Error('Give this numerical comparison a title of at most 300 characters.');
  const parent = `.archimedes/metric-comparisons/${owner.runId}`;
  const folder = metricPath(owner.dataRoot, `${parent}/placeholder`, true).target;
  const id = randomUUID(), manifestPath = receiptPath(owner, id), directory = path.join(path.dirname(folder), id);
  const sourcePath = `${path.posix.dirname(manifestPath)}/source.${input.format}`;
  const receipt = { version: 1, arithmetic: 'exact-decimal', id, title: title.trim(), owner, createdAt: new Date().toISOString(), runSnapshotSha256: snapshotHash(runSnapshot), source: { name: input.name, path: sourcePath, sha256: input.sha256, bytes: input.bytes, originalPath, origin: 'user-selected-file' }, mapping: comparison.mapping, rows: comparison.rows, counts: comparison.counts, computationSha256: digest(JSON.stringify(comparison)), coverage: 'User-confirmed column/value comparison only; attachment to a run does not establish that the run produced this file or scientifically reproduced the paper.' };
  const bytes = Buffer.from(JSON.stringify(receipt, null, 2));
  if (bytes.length > MAX_RECEIPT_BYTES) throw new Error('The metric comparison report exceeds 10 MiB.');
  fs.mkdirSync(directory); // Never overwrite or roll back another report directory.
  try {
    fs.writeFileSync(path.join(directory, `source.${input.format}`), sourceBytes, { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(path.join(directory, 'comparison.json'), bytes, { flag: 'wx', mode: 0o600 });
    return { ...receipt, manifestPath, sourceState: 'ready', runSnapshotMatches: true, state: 'recorded', reasons: [] };
  } catch (error) { fs.rmSync(directory, { recursive: true, force: true }); throw error; }
}

function getComparison(inputOwner, id, runSnapshot) {
  const owner = scope(inputOwner), manifestPath = receiptPath(owner, id), receipt = JSON.parse(readFile(owner.dataRoot, manifestPath, MAX_RECEIPT_BYTES));
  if (receipt.version !== 1 || receipt.id !== id || JSON.stringify(receipt.owner) !== JSON.stringify(owner)) throw new Error('This metric report does not belong to the selected project and run.');
  if (receipt.source.path !== `${path.posix.dirname(manifestPath)}/source.csv` && receipt.source.path !== `${path.posix.dirname(manifestPath)}/source.json`) throw new Error('Invalid metric source path.');
  let sourceState = 'ready';
  try { if (digest(readFile(owner.dataRoot, receipt.source.path, MAX_INPUT_BYTES)) !== receipt.source.sha256) sourceState = 'changed'; } catch { sourceState = 'missing'; }
  const runSnapshotMatches = receipt.runSnapshotSha256 === snapshotHash(runSnapshot), reasons = [];
  if (sourceState !== 'ready') reasons.push('The saved comparison source is missing or has changed.');
  if (!runSnapshotMatches) reasons.push('The run snapshot differs from the snapshot attached to this comparison.');
  if (receipt.arithmetic !== 'exact-decimal') reasons.push('This historical report needs reconfirmation using exact decimal comparison.');
  if (receipt.computationSha256 !== digest(JSON.stringify({ mapping: receipt.mapping, rows: receipt.rows, counts: receipt.counts }))) reasons.push('The saved comparison values or mapping have changed.');
  return { ...receipt, manifestPath, sourceState, runSnapshotMatches, state: reasons.length ? 'stale' : 'recorded', reasons };
}
function listComparisons(inputOwner, runSnapshot) {
  const owner = scope(inputOwner), parent = `.archimedes/metric-comparisons/${owner.runId}`;
  let directory;
  try { directory = metricPath(owner.dataRoot, parent).target; if (!fs.existsSync(directory)) return []; } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return fs.readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory() && /^[a-zA-Z0-9_-]+$/.test(entry.name)).map(entry => {
    try { const { rows, ...summary } = getComparison(owner, entry.name, runSnapshot); return summary; }
    catch (error) { return { id: entry.name, state: 'invalid', reasons: [error.message] }; }
  }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

module.exports = { parseInput, compare, saveComparison, getComparison, listComparisons, snapshotHash, MAX_INPUT_BYTES };
