// Controlled Supabase SDK protocol fixture. It exercises the real HTTP server
// and desktop sync clients without accounts or network services. PostgreSQL RLS
// and migration execution remain separate live-environment acceptance checks.
const { randomUUID } = require('node:crypto');
const { mergeTurn, threadStatus } = require('../../shared/cloud-sync.cjs');

function createCloudSdkFixture() {
  const tables = Object.fromEntries(['libraries', 'library_items', 'papers', 'paper_user_state', 'threads', 'turns', 'events', 'comments'].map(name => [name, []]));
  const roles = new Map();
  const now = () => new Date().toISOString();
  const role = (project, user) => roles.get(`${project}:${user}`);
  const editor = (project, user) => ['editor', 'admin', 'owner'].includes(role(project, user));
  const fail = (message = 'Permission denied.', code = '42501') => { throw Object.assign(new Error(message), { code }); };
  const library = id => tables.libraries.find(row => row.id === id);
  const thread = id => tables.threads.find(row => row.id === id);
  const item = (lib, paper) => tables.library_items.find(row => row.library_id === lib && row.item_id === paper);
  const visible = (table, row, user) => {
    if (['libraries', 'threads', 'comments'].includes(table)) return Boolean(role(row.project_id, user)) && (table !== 'threads' || row.visibility !== 'private' || row.owner_id === user);
    if (table === 'library_items') return Boolean(role(library(row.library_id)?.project_id, user));
    if (table === 'turns' || table === 'events') return visible('threads', thread(row.thread_id) || {}, user);
    if (table === 'paper_user_state') return row.user_id === user;
    return tables.library_items.some(value => value.item_id === row.id && role(library(value.library_id)?.project_id, user));
  };
  function refresh(id) { const target = thread(id); if (target) target.status = threadStatus(tables.turns.filter(row => row.thread_id === id), target.status); }

  function clientFor(user) {
    function from(table) {
      const filters = []; let operation = 'select', payload, one = false;
      const query = {
        select() { return query; }, eq(key, value) { filters.push(row => row[key] === value); return query; },
        is(key, value) { filters.push(row => (row[key] ?? null) === value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        order() { return query; }, single() { one = true; return query; }, maybeSingle() { one = true; return query; },
        upsert(value) { operation = 'upsert'; payload = value; return query; },
        insert(value) { operation = 'insert'; payload = value; return query; },
        update(value) { operation = 'update'; payload = value; return query; },
        async then(resolve, reject) {
          try {
            let rows = tables[table].filter(row => filters.every(match => match(row)) && visible(table, row, user));
            if (operation !== 'select') {
              const values = operation === 'update' ? rows.map(row => ({ ...row, ...payload })) : Array.isArray(payload) ? payload : [payload];
              rows = values.map(value => {
                const project = value.project_id || (table === 'library_items' ? library(value.library_id)?.project_id : thread(value.thread_id)?.project_id);
                if (table !== 'paper_user_state' && !editor(project, user)) fail();
                if (table === 'paper_user_state' && value.user_id !== user) fail();
                const old = tables[table].find(row => row.id && row.id === value.id);
                if (old && !visible(table, old, user)) fail();
                let next = { id: value.id || randomUUID(), created_at: old?.created_at || now(), updated_at: now(), sync_revision: 1, deleted_at: null, ...value };
                if (table === 'turns') {
                  next = mergeTurn(old, next);
                  if (old?.author_id && old.author_id !== value.author_id) fail();
                }
                if (table === 'libraries' && old) {
                  if (old.project_id !== value.project_id) fail();
                  next = old.deleted_at ? old : { ...next, sync_revision: old.sync_revision + 1 };
                }
                if (table === 'threads' && old) {
                  if (old.project_id !== value.project_id) fail();
                  next.owner_id = old.owner_id;
                }
                const index = tables[table].indexOf(old);
                if (index >= 0) tables[table][index] = next; else tables[table].push(next);
                if (table === 'turns') refresh(next.thread_id);
                if (table === 'threads') refresh(next.id);
                return next;
              });
            }
            const data = structuredClone(one ? rows[0] || null : rows);
            return resolve({ data, error: null });
          } catch (error) { return resolve({ data: null, error: { message: error.message, code: error.code || '40001' } }); }
        },
      };
      return query;
    }
    return { from, auth: { getUser: async () => ({ data: { user: { id: user } }, error: null }) },
      async rpc(name, args) {
        try {
          let data;
          if (name === 'library_sync_snapshot') {
            if (!role(args.p_project, user)) fail();
            const libraries = tables.libraries.filter(row => row.project_id === args.p_project);
            data = { protocol: 2, libraries, items: tables.library_items.filter(row => libraries.some(lib => lib.id === row.library_id)).map(row => ({ ...row, canonical_key: tables.papers.find(paper => paper.id === row.item_id)?.canonical_key || '' })) };
          } else if (name === 'delete_synced_library') {
            const row = library(args.p_library);
            if (!row || !editor(row.project_id, user)) fail();
            if (!row.deleted_at) Object.assign(row, { deleted_at: now(), sync_revision: row.sync_revision + 1 });
            data = row;
          } else if (name === 'remove_synced_library_paper') {
            const row = item(args.p_library, args.p_paper), lib = library(args.p_library);
            if (!lib || !editor(lib.project_id, user)) fail();
            if (!row) fail('Library paper not found.', '40001');
            if (!row.deleted_at) Object.assign(row, { deleted_at: now(), sync_revision: row.sync_revision + 1 });
            data = row;
          } else if (name === 'upsert_paper_to_library') {
            const lib = library(args.p_library), paper = args.p_paper;
            if (!lib || !editor(lib.project_id, user)) fail();
            if (lib.deleted_at) fail('Library was deleted.', '40001');
            let row = tables.papers.find(value => value.canonical_key === paper.canonical_key);
            if (!row) { row = { ...paper, id: randomUUID(), created_at: now(), updated_at: now() }; tables.papers.push(row); }
            let member = item(lib.id, row.id);
            if (member?.deleted_at) {
              if (Number(paper.restore_revision) !== member.sync_revision) fail('This paper was removed. Refresh before explicitly adding it again.', '40001');
              Object.assign(member, { deleted_at: null, sync_revision: member.sync_revision + 1, mutation_id: paper.mutation_id || '' });
            } else if (!member) {
              member = { library_id: lib.id, item_id: row.id, item_type: 'paper', added_by: user, added_at: now(), sync_revision: 1, deleted_at: null, mutation_id: paper.mutation_id || '' };
              tables.library_items.push(member);
            }
            data = row.id;
          } else fail(`Unsupported fixture RPC: ${name}`, '40001');
          return { data: structuredClone(data), error: null };
        } catch (error) { return { data: null, error: { message: error.message, code: error.code || '40001' } }; }
      },
    };
  }
  return { tables, roles, role, createClientImpl(_url, _key, options) { return clientFor(options.global.headers.Authorization.slice(7)); },
    addMember(project, user, value = 'editor') { roles.set(`${project}:${user}`, value); } };
}

module.exports = { createCloudSdkFixture };
