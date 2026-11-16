const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { fileDigest } = require('./manuscript-snapshot.cjs');
const resultFiles = require('./project-results.cjs');

const VERSION = 1;
const MAX_BYTES = 500 * 1024 * 1024;
const MAX_RECORD_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 10000;
const DEFAULT_SELECTION = { pdfs: true, annotations: true, reports: true, conversations: true, results: true, artifacts: true, reproductions: true, sourceFiles: [] };
const EXCLUDED = new Set(['.git', '.archimedes', 'node_modules', '.venv', 'venv', '__pycache__', '.cache', 'dist', 'build']);
const FIELDS = Object.fromEntries(Object.entries({
  research_projects: 'id owner_id name description workspace_path environment_id created_at updated_at archived_at',
  project_workspaces: 'id project_id kind name root base_ref last_session_id created_at updated_at',
  users: 'id display_name avatar_color created_at updated_at',
  libraries: 'id project_id name description color created_at updated_at',
  papers: 'id canonical_key title authors_json year venue abstract url pdf_url doi arxiv_id s2_id source citation_count github_url github_stars reading_status starred notes tags_json conference_json created_at updated_at',
  library_papers: 'library_id paper_id added_at',
  project_paper_selections: 'project_id paper_id reason discovery_json updated_at',
  paper_bibliography: 'paper_id citekey entry_type updated_at',
  paper_chat_threads: 'project_id paper_id thread_id created_at updated_at',
  paper_user_state: 'paper_id user_id reading_status starred notes tags_json created_at updated_at',
  paper_reader_assets: 'paper_id source_url relative_path sha256 status error size_bytes page_count truncated warning indexed_at updated_at',
  paper_reader_pages: 'paper_id page_number text',
  paper_highlights: 'id project_id paper_id author_id visibility page_number quote start_offset end_offset note color source created_at updated_at',
  paper_reviews: 'id project_id paper_id owner_id visibility review_json created_at updated_at',
  paper_presentations: 'id project_id paper_id owner_id visibility presentation_json source_review_updated_at created_at updated_at',
  research_threads: 'id project_id owner_id visibility title mode status context_summary context_summary_through_turn_id workspace_path workspace_id parent_id fork_id based_on_thread_id based_on_result_id kind pinned last_viewed_at unread_count created_at updated_at archived_at',
  task_runs: 'id prompt response status created_at',
  research_turns: 'id thread_id task_id mode user_message assistant_message status created_at completed_at',
  research_turn_attachments: 'turn_id position metadata_json image_data',
  research_events: 'id thread_id turn_id sequence type payload_json created_at',
  comments: 'id project_id resource_type resource_id parent_id anchor_json body author_id resolved_at created_at updated_at',
  research_artifacts: 'id project_id thread_id turn_id path title kind storage sha256 size_bytes modified_at version source created_at updated_at seen',
  project_results: 'id project_id workspace_id thread_id execution_root kind title manifest_path created_at updated_at',
  reproductions: 'id project_id workspace_id execution_root paper_id repo_url title status source_json contract_json budget_json error created_at updated_at',
  reproduction_runs: 'id reproduction_id status backend image steps_json log error started_at finished_at created_at updated_at snapshot_json',
  reproduction_attempts: 'id reproduction_id run_id attempt_no step_id class confidence evidence cause fix_json status created_at',
  metric_comparisons: 'id reproduction_id run_id',
  review_documents: 'id source_kind source_ref title page_count text_chars pages_json created_at',
  review_runs: 'id document_id project_id source_kind source_ref paper_title venue_id venue_version model_provider model_id status stage progress created_at finished_at overall_score calibrated_score confidence decision desk_reject_risk expected_outcome cost_tokens duration_ms error result_json manuscript_json owner_data_root',
  review_findings: 'id run_id reviewer_label kind text evidence_page evidence_quote severity dimension_id confidence created_at',
  review_scores: 'run_id dimension_id dimension_label score rationale',
}).map(([table, fields]) => [table, fields.split(' ')]));
const REVIEW_TABLES = { review_documents: 'paper_review_documents', review_runs: 'paper_review_runs', review_findings: 'paper_review_findings', review_scores: 'paper_review_scores' };
const ACTIVE = new Set(['running', 'queued', 'pending', 'waiting', 'awaiting_approval', 'preparing', 'planning', 'provisioning', 'diagnosing']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const totalBytes = resources => [...new Map(resources.map(file => [file.sha256, file.bytes])).values()].reduce((sum, bytes) => sum + bytes, 0);
const json = text => { try { return JSON.parse(text); } catch { return null; } };
const exists = (db, table) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
const rows = (db, table, predicate = () => true) => exists(db, table) ? db.prepare(`SELECT * FROM ${table}`).all().filter(predicate) : [];
const safeName = name => String(name || 'Project').replace(/[^\p{L}\p{N}._ -]/gu, '-').replace(/^\.+$/, 'Project').trim().slice(0, 70) || 'Project';
// Source paths describe another machine; only restored destinations use host path semantics.
const windowsSource = value => /^[a-z]:[\\/]|^\\\\/i.test(value);
const sourceAbsolute = value => typeof value === 'string' && !value.includes('\0') && (path.posix.isAbsolute(value) || windowsSource(value) && path.win32.isAbsolute(value));
const sourceNormalized = value => windowsSource(value) ? path.win32.normalize(value).replaceAll('\\', '/').replace(/\/$/, '') : path.posix.normalize(value).replace(/\/$/, '') || '/';
const sourceKey = value => windowsSource(value) ? sourceNormalized(value).toLowerCase() : sourceNormalized(value);

// Configuration/authorization fields are excluded. Research prose is not DLP-filtered.
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(?:api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|password|secret|private[_-]?key|resource(?:_json|Owner)?|pid|lease|serverId|nativeSessionId|approvalId|actionId|envValues)$/i.test(key)).map(([key, child]) => [key, clean(child)]));
}
function select(table, values) {
  return values.map(row => Object.fromEntries(FIELDS[table].filter(key => row[key] !== undefined).map(key => [key, key.endsWith('_json') ? JSON.stringify(clean(json(row[key]))) : row[key]])));
}
function relative(value) {
  if (typeof value !== 'string' || !value || /[\\:\0]/.test(value) || path.posix.isAbsolute(value) || value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('A plain workspace-relative file path is required.');
  return value;
}
function excludedResource(name) {
  const parts = name.split('/');
  if (parts.some(part => ['.git', 'node_modules', '.venv', 'venv', '__pycache__', '.cache', '.ssh', '.aws', '.kube'].includes(part) || /^\.env(?:\.|$)|\.(?:pem|key)$|^\.(?:npmrc|pypirc)$/i.test(part))) return true;
  const internal = parts.indexOf('.archimedes');
  return internal >= 0 && !['papers', 'latex-build', 'reproduction-logs', 'paper-to-slides', 'metric-comparisons'].includes(parts[internal + 1]);
}
function regular(root, name) {
  relative(name);
  const base = fs.realpathSync(root), target = path.resolve(base, name);
  if (!target.startsWith(`${base}${path.sep}`)) throw new Error('File is outside its workspace.');
  let current = base;
  for (const part of name.split('/')) { current = path.join(current, part); if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Linked files are not copied into project packages.'); }
  const stat = fs.statSync(target);
  if (!stat.isFile()) throw new Error('This resource is not a regular file.');
  return { target, stat };
}
function selection(input = {}) { return { ...DEFAULT_SELECTION, ...Object.fromEntries(Object.keys(DEFAULT_SELECTION).filter(key => typeof input[key] === 'boolean').map(key => [key, input[key]])), sourceFiles: Array.isArray(input.sourceFiles) ? input.sourceFiles : [] }; }

function collect(db, projectId, options) {
  const project = rows(db, 'research_projects', row => row.id === projectId)[0];
  if (!project) throw new Error('Project not found.');
  const choice = selection(options.selection), dataRoot = fs.realpathSync(options.dataRoot), userId = options.userId;
  const records = {}, resources = [], unavailable = [], roots = [];
  const add = (table, values) => { records[table] = select(table, values); return records[table]; };
  const rootKey = input => {
    const supplied = path.resolve(input || dataRoot);
    let original; try { original = fs.realpathSync(supplied); } catch { original = supplied; }
    let entry = roots.find(item => item.original === original);
    if (!entry) { entry = { key: `root-${roots.length}`, original, aliases: [] }; roots.push(entry); }
    if (supplied !== original && !entry.aliases.includes(supplied)) entry.aliases.push(supplied);
    return entry.key;
  };
  const addFile = (category, root, name, reference) => {
    const resource = { category, root: rootKey(root), path: name, reference };
    try {
      if (excludedResource(name)) throw new Error('Configuration, credentials and runtime caches are excluded.');
      const file = regular(root, name);
      if (file.stat.size > MAX_BYTES) throw new Error('Project packages are limited to 500 MiB.');
      const digest = fileDigest(file.target);
      if (resources.length >= MAX_FILES || digest.bytes > MAX_BYTES || totalBytes(resources) + (resources.some(item => item.sha256 === digest.sha256) ? 0 : digest.bytes) > MAX_BYTES) throw new Error('Project packages are limited to 10,000 files and 500 MiB.');
      const prepared = { ...resource, bytes: digest.bytes, sha256: digest.sha256, source: file.target };
      resources.push(prepared); return prepared;
    } catch (error) { unavailable.push({ ...resource, reason: error.message }); }
  };
  add('research_projects', [project]);
  const workspaces = add('project_workspaces', rows(db, 'project_workspaces', row => row.project_id === projectId));
  for (const workspace of workspaces) rootKey(workspace.root);
  if (!workspaces.length) throw new Error('This project has no local workspace.');
  const visible = row => row.visibility !== 'private' || (row.owner_id || row.author_id) === userId;
  const projectThreads = rows(db, 'research_threads', row => row.project_id === projectId && visible(row));
  for (const thread of projectThreads) if (thread.workspace_path) rootKey(thread.workspace_path);
  const sourceRoots = [...workspaces.map(row => ({ workspaceId: row.id, root: row.root })), ...projectThreads.filter(row => row.workspace_path).map(row => ({ workspaceId: row.workspace_id || workspaces[0].id, threadId: row.id, root: row.workspace_path }))];
  const libraries = add('libraries', rows(db, 'libraries', row => row.project_id === projectId)), libraryIds = new Set(libraries.map(row => row.id));
  const links = add('library_papers', rows(db, 'library_papers', row => libraryIds.has(row.library_id))), paperIds = new Set(links.map(row => row.paper_id));
  for (const table of ['project_paper_selections', 'paper_highlights', 'paper_reviews', 'paper_presentations', 'reproductions']) for (const row of rows(db, table, row => row.project_id === projectId)) if (row.paper_id) paperIds.add(row.paper_id);
  add('papers', rows(db, 'papers', row => paperIds.has(row.id)));
  add('project_paper_selections', rows(db, 'project_paper_selections', row => row.project_id === projectId && paperIds.has(row.paper_id)));
  add('paper_bibliography', rows(db, 'paper_bibliography', row => paperIds.has(row.paper_id)));
  add('paper_user_state', rows(db, 'paper_user_state', row => paperIds.has(row.paper_id) && row.user_id === userId));
  if (choice.pdfs) {
    const assets = add('paper_reader_assets', rows(db, 'paper_reader_assets', row => paperIds.has(row.paper_id)));
    add('paper_reader_pages', rows(db, 'paper_reader_pages', row => paperIds.has(row.paper_id)));
    for (const asset of assets) if (asset.relative_path) {
      const copied = addFile('pdfs', dataRoot, asset.relative_path, { table: 'paper_reader_assets', id: asset.paper_id });
      if (copied && asset.sha256 && copied.sha256 !== asset.sha256) {
        resources.splice(resources.indexOf(copied), 1);
        unavailable.push({ category: 'pdfs', path: asset.relative_path, reference: copied.reference, reason: 'The PDF changed since its text was indexed. Reattach it after restoring; mismatched PDF bytes are not included.' });
      }
    }
  }
  if (choice.annotations) add('paper_highlights', rows(db, 'paper_highlights', row => row.project_id === projectId && paperIds.has(row.paper_id) && visible(row)));
  if (choice.reports) for (const table of ['paper_reviews', 'paper_presentations']) add(table, rows(db, table, row => row.project_id === projectId && visible(row)));
  const threads = add('research_threads', choice.conversations ? projectThreads : []);
  const threadIds = new Set(threads.map(row => row.id));
  add('paper_chat_threads', rows(db, 'paper_chat_threads', row => row.project_id === projectId && threadIds.has(row.thread_id)));
  const turns = add('research_turns', rows(db, 'research_turns', row => threadIds.has(row.thread_id))), turnIds = new Set(turns.map(row => row.id)), taskIds = new Set(turns.map(row => row.task_id));
  add('task_runs', rows(db, 'task_runs', row => taskIds.has(row.id)));
  add('research_turn_attachments', rows(db, 'research_turn_attachments', row => turnIds.has(row.turn_id)));
  add('research_events', rows(db, 'research_events', row => turnIds.has(row.turn_id) && !/approval|permission|action_(?:pending|requested)/i.test(row.type)));
  add('comments', rows(db, 'comments', row => row.project_id === projectId && (threadIds.has(row.resource_id) || paperIds.has(row.resource_id))));
  if (choice.artifacts) {
    const artifacts = add('research_artifacts', rows(db, 'research_artifacts', row => threadIds.has(row.thread_id)));
    for (const artifact of artifacts) {
      const thread = threads.find(row => row.id === artifact.thread_id);
      if (artifact.storage !== 'local') unavailable.push({ category: 'artifacts', path: artifact.path, reference: { table: 'research_artifacts', id: artifact.id }, reason: 'Remote artifact storage is not a local project file.' });
      else addFile('artifacts', thread.workspace_path || dataRoot, artifact.path, { table: 'research_artifacts', id: artifact.id });
    }
  }
  if (choice.results) {
    const results = add('project_results', rows(db, 'project_results', row => row.project_id === projectId));
    for (const record of results) {
      rootKey(record.execution_root);
      try {
        const detail = resultFiles.readPackage({ id: record.id, projectId, workspaceId: record.workspace_id, threadId: record.thread_id, executionRoot: record.execution_root, kind: record.kind, manifestPath: record.manifest_path });
        record.transfer_manifest = clean(detail.manifest);
        record.transfer_files = detail.files.map(({ name, role, encoding, sha256, sizeBytes }) => ({ name, role, encoding, sha256, sizeBytes }));
        for (const file of detail.files) addFile('results', record.execution_root, file.path, { table: 'project_results', id: record.id, name: file.name, role: file.role, encoding: file.encoding });
      } catch (error) { unavailable.push({ category: 'results', path: record.manifest_path, reference: { table: 'project_results', id: record.id }, reason: error.message }); }
    }
  }
  if (choice.reproductions && db.prepare('PRAGMA table_info(reproductions)').all().some(column => column.name === 'project_id')) {
    const reproductions = add('reproductions', rows(db, 'reproductions', row => row.project_id === projectId)), ids = new Set(reproductions.map(row => row.id));
    for (const record of reproductions) if (record.execution_root) rootKey(record.execution_root);
    const runs = add('reproduction_runs', rows(db, 'reproduction_runs', row => ids.has(row.reproduction_id))), runIds = new Set(runs.map(row => row.id));
    add('reproduction_attempts', rows(db, 'reproduction_attempts', row => runIds.has(row.run_id)));
    for (const run of runs) {
      const snapshot = json(run.snapshot_json);
      for (const log of snapshot?.final?.logs || []) {
        if (log.storage === 'local') addFile('reproductions', dataRoot, log.path, { table: 'reproduction_runs', id: run.id });
        else unavailable.push({ category: 'reproductions', path: log.path, reference: { table: 'reproduction_runs', id: run.id }, reason: 'Remote run logs are not local files; the saved log tail remains in history.' });
      }
      if (snapshot?.prepared?.checkout?.location) unavailable.push({ category: 'reproductions', path: snapshot.prepared.checkout.location, reference: { table: 'reproduction_runs', id: run.id }, reason: 'The original checkout/environment is historical, not a migrated runnable environment. Selected source files are copied separately.' });
      const record = reproductions.find(record => record.id === run.reproduction_id);
      const scope = { dataRoot, projectId, workspaceId: record.workspace_id, executionRoot: record.execution_root, reproductionId: record.id, runId: run.id };
      try {
        const comparisons = require('./metric-comparison.cjs').listComparisons(scope, snapshot);
        for (const comparison of comparisons) {
          if (comparison.state === 'invalid') { unavailable.push({ category: 'comparisons', path: comparison.id, reason: comparison.reasons.join(' ') }); continue; }
          const report = addFile('comparisons', dataRoot, comparison.manifestPath, { table: 'metric_comparisons', id: comparison.id, runId: run.id });
          if (!report) continue;
          (records.metric_comparisons ||= []).push({ id: comparison.id, reproduction_id: record.id, run_id: run.id });
          addFile('comparisons', dataRoot, comparison.source.path, { table: 'metric_comparisons', id: comparison.id, runId: run.id });
        }
      } catch (error) { unavailable.push({ category: 'comparisons', path: run.id, reason: error.message }); }
    }
  }
  if (choice.reports && options.reviewDbPath && fs.existsSync(options.reviewDbPath)) {
    const review = new DatabaseSync(options.reviewDbPath, { readOnly: true });
    try {
      const all = rows(review, 'paper_review_runs', row => row.project_id === projectId);
      const runs = add('review_runs', all.filter(row => row.owner_data_root && path.resolve(row.owner_data_root) === dataRoot));
      for (const row of all.filter(row => !row.owner_data_root)) unavailable.push({ category: 'reports', path: row.paper_title, reference: { table: 'review_runs', id: row.id }, reason: 'Legacy report has no verified data-workspace owner; not included.' });
      const runIds = new Set(runs.map(row => row.id)), documentIds = new Set(runs.map(row => row.document_id));
      add('review_documents', rows(review, 'paper_review_documents', row => documentIds.has(row.id)));
      add('review_findings', rows(review, 'paper_review_findings', row => runIds.has(row.run_id)));
      add('review_scores', rows(review, 'paper_review_scores', row => runIds.has(row.run_id)));
      for (const run of runs) {
        const origin = json(run.manuscript_json);
        if (origin?.workspace && origin.manifestPath) {
          try {
            const snapshot = require('./manuscript-snapshot.cjs').readManuscriptSnapshot(origin.workspace, origin.manifestPath);
            for (const name of [snapshot.pdf?.path, snapshot.log?.path, snapshot.manifest_path].filter(Boolean)) addFile('reports', origin.workspace, name, { table: 'review_runs', id: run.id });
          } catch (error) { unavailable.push({ category: 'reports', path: origin.manifestPath, reference: { table: 'review_runs', id: run.id }, reason: error.message }); }
        }
      }
    } finally { review.close(); }
  }
  for (const file of choice.sourceFiles) {
    const workspace = workspaces.find(row => row.id === file.workspaceId);
    if (!workspace) throw new Error('A selected source file belongs to a different project.');
    const thread = file.threadId ? projectThreads.find(row => row.id === file.threadId && (row.workspace_id || workspaces[0].id) === workspace.id) : null;
    if (file.threadId && !thread) throw new Error('The selected source session does not belong to this project workspace.');
    relative(file.path);
    if (file.path.split('/').some(part => EXCLUDED.has(part) || /^\.env(?:\.|$)|\.(?:pem|key)$/i.test(part))) throw new Error('Configuration, credentials and runtime caches are excluded from selected source files.');
    addFile('sources', thread?.workspace_path || workspace.root, file.path, { workspaceId: workspace.id, ...(thread ? { threadId: thread.id } : {}) });
  }
  const userIds = new Set([userId]);
  for (const values of Object.values(records)) for (const row of values) for (const key of ['owner_id', 'author_id', 'user_id']) if (row[key]) userIds.add(row[key]);
  add('users', rows(db, 'users', row => userIds.has(row.id)));
  return { project, records, resources, unavailable, roots, sourceRoots, selection: choice, exporterUserId: userId, dataRoot };
}

function summary(bundle) {
  return { format: 'archimedes-project', version: VERSION, name: bundle.project?.name || bundle.name, counts: Object.fromEntries(Object.entries(bundle.records || bundle.counts || {}).map(([key, value]) => [key, Array.isArray(value) ? value.length : value])), fileCount: bundle.resources.length, totalBytes: totalBytes(bundle.resources), unavailable: bundle.unavailable, selection: bundle.selection, sourceRoots: bundle.sourceRoots, files: bundle.resources.map(({ source, ...file }) => file) };
}
function previewProject(db, projectId, options) { return summary(collect(db, projectId, options)); }

function exportProject(db, projectId, options) {
  const bundle = collect(db, projectId, options), parent = fs.realpathSync(options.destinationParent);
  const destination = path.join(parent, `${safeName(bundle.project.name)}-${randomUUID().slice(0, 8)}.archimedes-project`);
  fs.mkdirSync(destination);
  try {
    fs.mkdirSync(path.join(destination, 'blobs'));
    const records = Buffer.from(JSON.stringify(bundle.records));
    if (records.length > MAX_RECORD_BYTES) throw new Error('Project records exceed the 25 MiB migration limit. Export fewer conversations or reports.');
    fs.writeFileSync(path.join(destination, 'records.json'), records, { flag: 'wx' });
    for (const resource of bundle.resources) {
      const target = path.join(destination, 'blobs', resource.sha256);
      if (!fs.existsSync(target)) fs.copyFileSync(resource.source, target, fs.constants.COPYFILE_EXCL);
      if (fileDigest(target).sha256 !== resource.sha256) throw new Error('A source resource changed during export. Try exporting again.');
    }
    const manifest = { ...summary(bundle), createdAt: new Date().toISOString(), projectId, exporterUserId: bundle.exporterUserId, sourcePlatform: process.platform, sourceDataRoot: bundle.dataRoot, roots: bundle.roots, recordsSha256: hash(records), excluded: ['credentials/configuration', 'runtime caches', 'live process/resource ownership', 'pending approvals', 'native session bindings', 'cloud links, membership grants and pending cloud outbox'] };
    // summary.files is the selected resource inventory; source absolute paths are never copied as payloads.
    fs.writeFileSync(path.join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    return { ...summary(bundle), path: destination };
  } catch (error) { fs.rmSync(destination, { recursive: true, force: true }); throw error; }
}

function readPackage(packagePath) {
  const directory = fs.realpathSync(packagePath), manifestFile = regular(directory, 'manifest.json');
  if (manifestFile.stat.size > MAX_RECORD_BYTES) throw new Error('Invalid project package manifest size.');
  const manifest = JSON.parse(fs.readFileSync(manifestFile.target, 'utf8'));
  if (manifest.format !== 'archimedes-project' || manifest.version !== VERSION || !Array.isArray(manifest.files) || !Array.isArray(manifest.roots) || manifest.files.length > MAX_FILES) throw new Error('Unsupported project migration package.');
  const recordFile = regular(directory, 'records.json');
  if (recordFile.stat.size > MAX_RECORD_BYTES) throw new Error('Project records exceed the migration limit.');
  const bytes = fs.readFileSync(recordFile.target);
  if (hash(bytes) !== manifest.recordsSha256) throw new Error('The project records hash does not match the manifest.');
  if (manifest.roots.some(root => !/^root-\d+$/.test(root.key) || !sourceAbsolute(root.original) || root.aliases && (!Array.isArray(root.aliases) || root.aliases.some(alias => !sourceAbsolute(alias)))) || new Set(manifest.roots.map(root => root.key)).size !== manifest.roots.length) throw new Error('Invalid project workspace inventory.');
  const records = JSON.parse(bytes), rootKeys = new Set(manifest.roots.map(root => root.key)), destinations = new Set();
  if (!records.research_projects || records.research_projects.length !== 1 || records.research_projects[0].id !== manifest.projectId) throw new Error('Invalid project record.');
  if (!Array.isArray(records.project_workspaces) || !records.project_workspaces.length) throw new Error('The package needs a local project workspace.');
  const registeredRoots = new Set(manifest.roots.flatMap(root => [root.original, ...(root.aliases || [])].map(sourceKey)));
  for (const table of ['project_workspaces', 'research_threads', 'project_results', 'reproductions']) for (const row of records[table] || []) {
    const root = row.root || row.workspace_path || row.execution_root;
    if (root && (!sourceAbsolute(root) || !registeredRoots.has(sourceKey(root)))) throw new Error('A project record references an unregistered source root.');
  }
  for (const [table, values] of Object.entries(records)) {
    if (!FIELDS[table] || !Array.isArray(values) || values.length > 100000) throw new Error('Invalid project record inventory.');
    for (const row of values) if (Object.keys(row).some(key => !FIELDS[table].includes(key) && !(table === 'project_results' && ['transfer_manifest', 'transfer_files'].includes(key)))) throw new Error('The package contains unsupported or runtime record fields.');
    const ids = values.filter(row => row.id).map(row => row.id);
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate project record IDs.');
    if ((manifest.counts[table] || 0) !== values.length) throw new Error('Project record counts do not match the manifest.');
  }
  let total = 0; const uniqueBlobs = new Set();
  for (const file of manifest.files) {
    relative(file.path);
    if (excludedResource(file.path)) throw new Error('The package contains excluded configuration or runtime files.');
    if (!rootKeys.has(file.root) || !['pdfs', 'annotations', 'reports', 'artifacts', 'results', 'sources', 'reproductions', 'comparisons'].includes(file.category) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0) throw new Error('Invalid project file inventory.');
    const destination = `${file.root}/${file.path}`;
    if (destinations.has(destination)) {
      const other = manifest.files.find(candidate => candidate !== file && `${candidate.root}/${candidate.path}` === destination);
      if (other.sha256 !== file.sha256) throw new Error('Conflicting project file destinations.');
    }
    destinations.add(destination); if (!uniqueBlobs.has(file.sha256)) { total += file.bytes; uniqueBlobs.add(file.sha256); }
    if (total > MAX_BYTES) throw new Error('Project package exceeds the 500 MiB limit.');
    const asset = regular(directory, `blobs/${file.sha256}`);
    if (asset.stat.size !== file.bytes) throw new Error(`The resource hash does not match: ${file.path}`);
    const digest = fileDigest(asset.target);
    if (digest.bytes !== file.bytes || digest.sha256 !== file.sha256) throw new Error(`The resource hash does not match: ${file.path}`);
  }
  if (manifest.fileCount !== manifest.files.length || manifest.totalBytes !== total) throw new Error('Project resource counts do not match the manifest.');
  return { directory, manifest, records };
}
function inspectPackage(packagePath) { const { directory, manifest } = readPackage(packagePath); return { ...manifest, path: directory }; }

function insert(db, table, record, schema = 'main') {
  const available = new Set(db.prepare(`PRAGMA ${schema}.table_info(${table})`).all().map(column => column.name));
  const fields = Object.keys(record).filter(key => available.has(key));
  db.prepare(`INSERT INTO ${schema}.${table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`).run(...fields.map(key => record[key]));
}

function importProject(db, packagePath, options) {
  const { directory, manifest, records } = readPackage(packagePath), dataRoot = fs.realpathSync(options.dataRoot), parent = fs.realpathSync(options.targetParent);
  const idMap = new Map(), now = new Date().toISOString(), createdPdfs = [], newId = id => id ? (idMap.has(id) ? idMap.get(id) : (idMap.set(id, randomUUID()), idMap.get(id))) : null;
  idMap.set(manifest.exporterUserId, options.userId);
  for (const values of Object.values(records)) for (const row of values) if (row.id) newId(row.id);
  const knownIds = new Set(idMap.keys());
  const projectId = newId(manifest.projectId), name = String(options.name || manifest.name).trim().slice(0, 100);
  if (!name) throw new Error('Give the restored project a name.');
  let restoredName = name, suffix = 2;
  while (db.prepare('SELECT 1 FROM research_projects WHERE name=?').get(restoredName)) restoredName = `${name.slice(0, 85)} (restored ${suffix++})`;
  const destination = path.join(parent, `${safeName(restoredName)}-${projectId.slice(0, 8)}`);
  const rootMap = new Map(), workspaceRows = records.project_workspaces || [], primary = workspaceRows.find(row => row.kind === 'shared') || workspaceRows[0];
  for (const root of manifest.roots) {
    const keys = [root.original, ...(root.aliases || [])].map(sourceKey);
    const workspace = workspaceRows.find(row => keys.includes(sourceKey(row.root)));
    const target = workspace?.id === primary?.id ? destination : path.join(destination, workspace ? `workspaces/${newId(workspace.id)}` : `history/${root.key}`);
    for (const key of keys) { if (rootMap.has(key) && rootMap.get(key) !== target) throw new Error('Conflicting source workspace aliases.'); rootMap.set(key, target); }
  }
  const relativePaths = [
    ...(records.project_results || []).map(row => [`research-results/${row.kind}/${row.id}`, `research-results/${row.kind}/${newId(row.id)}`]),
    ...(records.paper_reader_assets || []).map(row => [row.relative_path, `.archimedes/papers/${newId(row.paper_id)}.pdf`]).filter(([original]) => original),
    ...manifest.files.filter(file => file.category === 'reproductions').map(file => [file.path, `.archimedes/reproduction-logs/${newId(file.reference.id)}/${path.posix.basename(file.path)}`]),
  ];
  const remapPath = value => { for (const [old, target] of relativePaths) if (value === old || value.startsWith(`${old}/`)) return target + value.slice(old.length); return value; };
  const remap = value => {
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(clean(value)).map(([key, child]) => [key, key === 'dataRoot' ? dataRoot : ['threadId', 'turnId'].includes(key) && child && !knownIds.has(child) ? null : remap(child)]));
    if (typeof value !== 'string') return value;
    if (idMap.has(value)) return idMap.get(value);
    if (sourceAbsolute(value)) {
      const original = sourceKey(value);
      for (const [old, target] of [...rootMap].sort((a, b) => b[0].length - a[0].length)) if (original === old || original.startsWith(old === '/' ? '/' : `${old}/`)) return original === old ? target : path.join(target, remapPath(sourceNormalized(value).slice(old === '/' ? 1 : old.length + 1)));
    }
    return remapPath(value);
  };
  const idFields = new Set(['project_id', 'paper_id', 'library_id', 'workspace_id', 'thread_id', 'turn_id', 'task_id', 'reproduction_id', 'run_id', 'document_id', 'owner_id', 'author_id', 'user_id', 'environment_id', 'parent_id', 'fork_id', 'based_on_thread_id', 'based_on_result_id', 'context_summary_through_turn_id', 'last_session_id']);
  const transform = row => Object.fromEntries(Object.entries(row).filter(([key]) => !['transfer_manifest', 'transfer_files'].includes(key)).map(([key, value]) => [key,
    key === 'project_id' ? projectId : idFields.has(key) ? newId(value) : ['workspace_path', 'execution_root', 'root'].includes(key) && value ? (rootMap.get(sourceKey(value)) || path.join(destination, 'unavailable', newId(value))) : key.endsWith('_json') ? JSON.stringify(remap(json(value))) : remap(value)]));
  let attached = false, restoredResults = 0; const restoredResultIds = new Set();
  fs.mkdirSync(destination); // Exclusive, outside rollback: never remove a pre-existing directory.
  try {
    for (const root of new Set(rootMap.values())) fs.mkdirSync(root, { recursive: true });
    for (const file of manifest.files.filter(file => file.category !== 'pdfs' && file.category !== 'results' && file.category !== 'reproductions' && file.category !== 'comparisons' && !relativePaths.some(([old]) => file.category === 'artifacts' && file.path.startsWith(`${old}/`)))) {
      const root = rootMap.get(sourceKey(manifest.roots.find(entry => entry.key === file.root).original)), output = path.join(root, relative(file.path));
      fs.mkdirSync(path.dirname(output), { recursive: true });
      if (!fs.existsSync(output)) fs.copyFileSync(path.join(directory, 'blobs', file.sha256), output, fs.constants.COPYFILE_EXCL);
      if (file.category === 'reports' && file.path.endsWith('/source-snapshot.json')) fs.writeFileSync(output, `${JSON.stringify(remap(JSON.parse(fs.readFileSync(output, 'utf8'))), null, 2)}\n`);
    }
    for (const file of manifest.files.filter(file => file.category === 'reproductions')) {
      const output = path.join(dataRoot, remapPath(file.path));
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.copyFileSync(path.join(directory, 'blobs', file.sha256), output, fs.constants.COPYFILE_EXCL); createdPdfs.push(output);
    }
    if ((records.review_runs || []).length) {
      if (!options.reviewDbPath || !fs.existsSync(options.reviewDbPath)) throw new Error('Paper review storage is unavailable; restore into the desktop app with report storage initialized.');
      db.prepare('ATTACH DATABASE ? AS transfer_review').run(options.reviewDbPath); attached = true;
    }
    db.exec('SAVEPOINT import_project_package');
    try {
      for (const row of records.users || []) if (row.id !== manifest.exporterUserId && !db.prepare('SELECT 1 FROM users WHERE id=?').get(newId(row.id))) insert(db, 'users', { ...transform(row), email: '' });
      const project = { ...transform(records.research_projects[0]), id: projectId, owner_id: options.userId, name: restoredName, workspace_path: destination, environment_id: newId(`environment:${projectId}`), git_state: 'none', git_branch: null, cloud_project_id: null, archived_at: null };
      insert(db, 'research_projects', project);
      insert(db, 'project_environments', { id: project.environment_id, project_id: projectId, kind: 'local', provider: 'local', binding_json: '{}', created_at: now, updated_at: now });
      insert(db, 'project_members', { project_id: projectId, user_id: options.userId, role: 'owner', source: 'local', joined_at: now, invited_by: null });
      for (const row of workspaceRows) insert(db, 'project_workspaces', { ...transform(row), root: rootMap.get(sourceKey(row.root)) || destination, kind: row.id === primary.id ? 'shared' : 'sandbox', base_ref: null, last_session_id: knownIds.has(row.last_session_id) ? idMap.get(row.last_session_id) : null });
      for (const table of ['libraries', 'papers', 'library_papers', 'project_paper_selections', 'paper_bibliography', 'paper_user_state', 'paper_reader_assets', 'paper_reader_pages', 'paper_highlights', 'paper_reviews', 'paper_presentations', 'research_threads', 'paper_chat_threads', 'task_runs', 'research_turns', 'research_turn_attachments', 'research_events', 'comments', 'research_artifacts', 'reproductions', 'reproduction_runs', 'reproduction_attempts']) {
        for (const row of records[table] || []) {
          const copy = transform(row);
          if (copy.canonical_key) copy.canonical_key = `restored:${projectId}:${copy.canonical_key}`;
          if (table === 'research_threads') { copy.status = 'idle'; copy.harness = 'api'; copy.unread_count = 0; copy.based_on_result_id = null; }
          if (ACTIVE.has(copy.status)) { copy.status = table === 'reproductions' ? 'cancelled' : 'interrupted'; if ('finished_at' in copy) copy.finished_at = now; if ('completed_at' in copy) copy.completed_at = now; }
          for (const key of ['parent_id', 'fork_id', 'based_on_thread_id', 'context_summary_through_turn_id', 'thread_id', 'turn_id', 'task_id']) if (row[key] && !knownIds.has(row[key])) copy[key] = null;
          if (table === 'reproduction_runs') {
            copy.resource_json = '{}';
            const original = json(row.snapshot_json), snapshot = json(copy.snapshot_json);
            if (snapshot) {
              snapshot.restoration = { version: 1, importedAt: now, sourceRecordsSha256: manifest.recordsSha256, originalRunId: row.id, originalReproductionId: row.reproduction_id, originalOwner: original.owner, originalCheckout: original.prepared?.checkout || null };
              if (snapshot.prepared?.checkout) snapshot.prepared.checkout.location = null;
              copy.snapshot_json = JSON.stringify(snapshot);
            }
          }
          if (table === 'research_artifacts') copy.storage = 'local';
          if (table === 'paper_reader_assets') {
            const file = manifest.files.find(file => file.reference?.table === table && file.reference.id === row.paper_id);
            copy.relative_path = `.archimedes/papers/${newId(row.paper_id)}.pdf`;
            if (file) { const target = path.join(dataRoot, copy.relative_path); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(directory, 'blobs', file.sha256), target, fs.constants.COPYFILE_EXCL); createdPdfs.push(target); }
            else { copy.status = 'failed'; copy.error = 'PDF was not available in the imported package.'; copy.relative_path = ''; }
          }
          insert(db, table, copy);
        }
      }
      for (const row of records.project_results || []) {
        const files = manifest.files.filter(file => file.reference?.table === 'project_results' && file.reference.id === row.id);
        if (!row.transfer_files?.length) continue;
        const scope = transform(row), executionRoot = rootMap.get(sourceKey(row.execution_root)) || destination;
        if (!['analysis', 'figure'].includes(row.kind)) throw new Error('Unsupported restored project result kind.');
        const resultOwner = { id: scope.id, projectId, workspaceId: scope.workspace_id, threadId: knownIds.has(row.thread_id) ? idMap.get(row.thread_id) : null, executionRoot, kind: row.kind };
        const manifestPath = `research-results/${row.kind}/${scope.id}/manifest.json`, manifestFile = path.join(executionRoot, manifestPath);
        if (files.length) resultFiles.savePackage({ ...resultOwner, title: row.title, manifest: remap(row.transfer_manifest), files: files.map(file => ({ name: file.reference.name, role: file.reference.role, encoding: file.reference.encoding, content: fs.readFileSync(path.join(directory, 'blobs', file.sha256)).toString(file.reference.encoding) })) });
        else fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
        // Keep expected hashes/inventory, so absent or externally changed files
        // remain missing/changed after migration rather than becoming "ready".
        const envelope = { schemaVersion: 1, owner: resultOwner, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at, manifest: remap(row.transfer_manifest), files: row.transfer_files.map(file => ({ ...file, path: `research-results/${row.kind}/${scope.id}/${file.name}` })) };
        fs.writeFileSync(manifestFile, `${JSON.stringify(envelope, null, 2)}\n`);
        const receipt = resultFiles.readPackage({ ...resultOwner, manifestPath });
        insert(db, 'project_results', { ...scope, execution_root: receipt.executionRoot, thread_id: receipt.threadId, manifest_path: receipt.manifestPath });
        restoredResults++;
        restoredResultIds.add(row.id);
        // Result artifact links share the newly generated result paths.
        for (const file of files) db.prepare('UPDATE research_artifacts SET path=? WHERE project_id=? AND path=?').run(`research-results/${row.kind}/${scope.id}/${file.reference.name}`, projectId, file.path);
      }
      for (const thread of records.research_threads || []) if (thread.based_on_result_id && restoredResultIds.has(thread.based_on_result_id)) db.prepare('UPDATE research_threads SET based_on_result_id=? WHERE id=?').run(newId(thread.based_on_result_id), newId(thread.id));
      for (const comparison of records.metric_comparisons || []) {
        const run = (records.reproduction_runs || []).find(row => row.id === comparison.run_id && row.reproduction_id === comparison.reproduction_id);
        const record = (records.reproductions || []).find(row => row.id === comparison.reproduction_id);
        const resources = manifest.files.filter(file => file.reference?.table === 'metric_comparisons' && file.reference.id === comparison.id);
        const report = resources.find(file => file.path.endsWith('/comparison.json'));
        if (!run || !record || !report || report.bytes > 10 * 1024 * 1024) throw new Error('A numerical comparison has no valid packaged run or report.');
        const original = JSON.parse(fs.readFileSync(path.join(directory, 'blobs', report.sha256), 'utf8'));
        if (original.id !== comparison.id || original.owner?.runId !== comparison.run_id || original.owner?.reproductionId !== comparison.reproduction_id || original.owner?.projectId !== manifest.projectId) throw new Error('A numerical report does not belong to its packaged run.');
        const id = newId(comparison.id), base = `.archimedes/metric-comparisons/${newId(run.id)}/${id}`;
        const restored = { ...original, id, owner: { dataRoot, projectId, workspaceId: newId(record.workspace_id), executionRoot: rootMap.get(sourceKey(record.execution_root)) || destination, reproductionId: newId(record.id), runId: newId(run.id) }, source: { ...original.source, path: `${base}/source.${original.source.path.endsWith('.csv') ? 'csv' : 'json'}` }, restoration: { importedAt: now, originalComparisonId: comparison.id, sourceRecordsSha256: manifest.recordsSha256 } };
        const folder = path.join(dataRoot, base); fs.mkdirSync(folder, { recursive: true });
        const source = resources.find(file => file.path === original.source.path);
        if (source && source.bytes > 2 * 1024 * 1024) throw new Error('The packaged metric source exceeds 2 MiB.');
        if (source) { const file = path.join(dataRoot, restored.source.path); fs.copyFileSync(path.join(directory, 'blobs', source.sha256), file, fs.constants.COPYFILE_EXCL); createdPdfs.push(file); }
        const file = path.join(folder, 'comparison.json'); fs.writeFileSync(file, `${JSON.stringify(restored, null, 2)}\n`, { flag: 'wx' }); createdPdfs.push(file);
      }
      for (const [table, actual] of Object.entries(REVIEW_TABLES)) for (const row of records[table] || []) {
        const copy = transform(row);
        if (table === 'review_runs') {
          copy.owner_data_root = dataRoot;
          if (ACTIVE.has(copy.status)) { copy.status = 'interrupted'; copy.stage = 'interrupted'; copy.finished_at = now; }
          const origin = json(copy.manuscript_json);
          if (origin?.workspace && origin.manifestPath) {
            const build = path.dirname(path.join(origin.workspace, relative(origin.manifestPath)));
            if (build.startsWith(`${destination}${path.sep}`) && fs.existsSync(build)) {
              const marker = path.join(build, 'retained-inputs.json'), refs = fs.existsSync(marker) ? JSON.parse(fs.readFileSync(marker, 'utf8')) : [];
              refs.push({ kind: 'paper-review', run_id: copy.id, created_at: now });
              fs.writeFileSync(marker, `${JSON.stringify(refs, null, 2)}\n`);
            }
          }
        }
        insert(db, actual, copy, 'transfer_review');
      }
      db.exec('RELEASE import_project_package');
    } catch (error) { db.exec('ROLLBACK TO import_project_package'); db.exec('RELEASE import_project_package'); throw error; }
    return { projectId, name: restoredName, workspacePath: destination, counts: { ...manifest.counts, project_results: restoredResults }, unavailable: manifest.unavailable || [], localOnly: true };
  } catch (error) {
    fs.rmSync(destination, { recursive: true, force: true });
    // Reader PDFs use new IDs, so rollback can remove only this import's files.
    for (const file of createdPdfs) fs.rmSync(file, { force: true });
    throw error;
  } finally { if (attached) db.exec('DETACH DATABASE transfer_review'); }
}

module.exports = { previewProject, exportProject, inspectPackage, importProject, DEFAULT_SELECTION, FIELDS };
