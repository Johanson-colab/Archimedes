const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const repository = path.resolve(__dirname, '../../../..');
const docker = '/usr/local/bin/docker';
const name = `archimedes-cloud-sync-${randomUUID()}`;
function run(args, input, timeout = 30_000) {
  const result = spawnSync(docker, ['--context', 'desktop-linux', ...args], { input, encoding: 'utf8', timeout, maxBuffer: 4_000_000 });
  if (result.status !== 0) throw new Error(`${args.slice(0, 3).join(' ')}: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout;
}
function sql(text) { return run(['exec', '-i', name, 'psql', '-U', 'postgres', '-d', 'cloud_sync_test', '-v', 'ON_ERROR_STOP=1', '-q'], text); }
function concurrentSql(text) {
  return new Promise((resolve, reject) => {
    const child = spawn(docker, ['--context', 'desktop-linux', 'exec', '-i', name, 'psql', '-U', 'postgres', '-d', 'cloud_sync_test', '-v', 'ON_ERROR_STOP=1', '-q']);
    let error = '';
    const timeout = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Concurrent SQL exceeded 10 seconds')); }, 10_000);
    child.stdout.resume(); child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject); child.on('close', code => { clearTimeout(timeout); if (code === 0) resolve(); else reject(new Error(error)); });
    child.stdin.end(text);
  });
}

(async () => {
  try {
    run(['run', '--pull=never', '-d', '--name', name, '--label', 'archimedes.review=cloud-sync', '--network', 'none', '--cpus', '1', '--memory', '384m', '--pids-limit', '128', '--tmpfs', '/var/lib/postgresql/data:rw,size=192m', '-e', 'POSTGRES_PASSWORD=local-fixture-only', '-e', 'POSTGRES_DB=cloud_sync_test', 'postgres:17-alpine']);
    let ready = false;
    for (let index = 0; index < 30; index++) {
      const logs = spawnSync(docker, ['--context', 'desktop-linux', 'logs', name], { encoding: 'utf8', timeout: 2000 });
      const initialized = `${logs.stdout}${logs.stderr}`.includes('PostgreSQL init process complete; ready for start up');
      const result = spawnSync(docker, ['--context', 'desktop-linux', 'exec', name, 'pg_isready', '-U', 'postgres'], { encoding: 'utf8', timeout: 2000 });
      if (initialized && result.status === 0) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, 'isolated Postgres did not start within 15 seconds');
    sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth, public TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;`);
    const directory = path.join(repository, 'server/sql');
    const files = fs.readdirSync(directory).filter(file => file.endsWith('.sql')).sort();
    for (const file of files.filter(file => file < '0013')) {
      // 0001 requests the optional vector extension but never uses its types.
      // The plain official Postgres image lacks it; all collaboration DDL/RLS
      // and every other migration execute unchanged.
      const source = fs.readFileSync(path.join(directory, file), 'utf8').replace('create extension if not exists vector;', '-- optional unused vector extension omitted in plain-Postgres fixture');
      sql(source);
    }
    sql(`INSERT INTO auth.users(id,email) VALUES
      ('11111111-1111-1111-1111-111111111111','owner@fixture.invalid'),
      ('22222222-2222-2222-2222-222222222222','peer@fixture.invalid'),
      ('33333333-3333-3333-3333-333333333333','viewer@fixture.invalid'),
      ('44444444-4444-4444-4444-444444444444','outsider@fixture.invalid');
      INSERT INTO public.orgs(id,name) VALUES ('aaaaaaaa-0000-0000-0000-000000000000','Fixture');
      INSERT INTO public.projects(id,org_id,owner_id,name) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111111','Fixture');
      INSERT INTO public.project_members(project_id,user_id,role) VALUES
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','owner'),
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','editor'),
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','viewer');
      INSERT INTO public.libraries(id,project_id,name) VALUES
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','First'),
      ('cccccccc-cccc-cccc-cccc-cccccccccccc','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Second');
      INSERT INTO public.threads(id,project_id,owner_id,title,mode) VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Thread','free-chat');
      INSERT INTO public.turns(id,thread_id,author_id,author_type,mode,user_message,assistant_message,status) VALUES
      ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-1111-1111-1111-111111111111','user','free-chat','Question','Pre-migration completed','completed');`);
    sql(fs.readFileSync(path.join(directory, '0013_sync_integrity.sql'), 'utf8'));
    sql(fs.readFileSync(path.join(directory, '0013_sync_integrity.sql'), 'utf8')); // Idempotent deployment.
    sql('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;');
    const results = sql(`SET ROLE authenticated; SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
      DO $$ BEGIN
        IF (SELECT sync_revision FROM public.turns WHERE id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') <> 2 THEN RAISE EXCEPTION 'terminal migration did not backfill'; END IF;
        UPDATE public.turns SET status='running', assistant_message='' WHERE id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
        IF (SELECT assistant_message FROM public.turns WHERE id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') <> 'Pre-migration completed' THEN RAISE EXCEPTION 'stale update erased terminal'; END IF;
      END $$;
      INSERT INTO public.turns(id,thread_id,author_id,author_type,mode,user_message,status) VALUES
      ('ffffffff-ffff-ffff-ffff-ffffffffffff','dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-1111-1111-1111-111111111111','user','free-chat','Partial question','running');
      UPDATE public.turns SET status='incomplete', assistant_message='Partial scientific output', completed_at=now() WHERE id='ffffffff-ffff-ffff-ffff-ffffffffffff';
      INSERT INTO public.turns(id,thread_id,author_id,author_type,mode,user_message,status) VALUES
      ('ffffffff-ffff-ffff-ffff-ffffffffffff','dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-1111-1111-1111-111111111111','user','free-chat','Stale question','running')
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,user_message=excluded.user_message,assistant_message=excluded.assistant_message;
      UPDATE public.threads SET status='running' WHERE id='dddddddd-dddd-dddd-dddd-dddddddddddd';
      DO $$ BEGIN
        IF (SELECT status FROM public.turns WHERE id='ffffffff-ffff-ffff-ffff-ffffffffffff') <> 'incomplete' THEN RAISE EXCEPTION 'upsert regressed final'; END IF;
        IF (SELECT status FROM public.threads WHERE id='dddddddd-dddd-dddd-dddd-dddddddddddd') <> 'error' THEN RAISE EXCEPTION 'aggregate regressed final'; END IF;
      END $$;
      DO $$ DECLARE p uuid; snap jsonb; BEGIN
        p := public.upsert_paper_to_library('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','{"canonical_key":"doi:fixture/shared","title":"Shared paper"}');
        PERFORM public.upsert_paper_to_library('cccccccc-cccc-cccc-cccc-cccccccccccc','{"canonical_key":"doi:fixture/shared","title":"Shared paper"}');
        PERFORM public.remove_synced_library_paper('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',p);
        PERFORM public.remove_synced_library_paper('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',p);
        IF (SELECT sync_revision FROM public.library_items WHERE library_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND item_id=p) <> 2 THEN RAISE EXCEPTION 'delete retry not idempotent'; END IF;
        BEGIN
          PERFORM public.upsert_paper_to_library('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','{"canonical_key":"doi:fixture/shared","title":"Old offline upload"}');
          RAISE EXCEPTION 'stale add resurrected deleted membership';
        EXCEPTION WHEN serialization_failure THEN NULL; END;
        IF NOT EXISTS(SELECT 1 FROM public.library_items WHERE library_id='cccccccc-cccc-cccc-cccc-cccccccccccc' AND item_id=p AND deleted_at IS NULL) THEN RAISE EXCEPTION 'other library lost paper'; END IF;
        PERFORM public.upsert_paper_to_library('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','{"canonical_key":"doi:fixture/shared","title":"Explicit re-add","restore_revision":2,"mutation_id":"intent-1"}');
        PERFORM public.upsert_paper_to_library('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','{"canonical_key":"doi:fixture/shared","title":"Retry re-add","restore_revision":2,"mutation_id":"intent-1"}');
        IF (SELECT sync_revision FROM public.library_items WHERE library_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND item_id=p) <> 3 THEN RAISE EXCEPTION 're-add revision wrong'; END IF;
        DELETE FROM public.library_items WHERE library_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND item_id=p;
        IF NOT EXISTS(SELECT 1 FROM public.library_items WHERE library_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND item_id=p AND deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'legacy DELETE bypassed tombstone'; END IF;
        PERFORM public.delete_synced_library('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
        UPDATE public.libraries SET name='Stale update',deleted_at=NULL WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
        IF NOT EXISTS(SELECT 1 FROM public.libraries WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'library revived'; END IF;
        IF NOT EXISTS(SELECT 1 FROM public.papers WHERE id=p) THEN RAISE EXCEPTION 'canonical paper deleted'; END IF;
        snap := public.library_sync_snapshot('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
        IF (snap->>'protocol')::integer <> 2 THEN RAISE EXCEPTION 'snapshot protocol missing'; END IF;
      END $$;
      SET request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
      DO $$ BEGIN
        DELETE FROM public.library_items WHERE library_id='cccccccc-cccc-cccc-cccc-cccccccccccc' AND item_type='paper';
        IF NOT EXISTS(SELECT 1 FROM public.library_items WHERE library_id='cccccccc-cccc-cccc-cccc-cccccccccccc' AND deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'peer editor legacy DELETE did not keep tombstone'; END IF;
      END $$;
      SET request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
      DO $$ BEGIN
        PERFORM public.library_sync_snapshot('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
        BEGIN PERFORM public.delete_synced_library('cccccccc-cccc-cccc-cccc-cccccccccccc'); RAISE EXCEPTION 'viewer delete allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      END $$;
      SET request.jwt.claim.sub='44444444-4444-4444-4444-444444444444';
      DO $$ BEGIN
        BEGIN PERFORM public.library_sync_snapshot('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'); RAISE EXCEPTION 'outsider read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
        BEGIN PERFORM public.upsert_paper_to_library('cccccccc-cccc-cccc-cccc-cccccccccccc','{"canonical_key":"outsider","title":"No access"}'); RAISE EXCEPTION 'outsider add allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      END $$;
      SELECT 'PASS: migration/backfill, same-ID final monotonicity, aggregate status, membership delete/retry/re-add, legacy DELETE, library tombstone, retained canonical paper, viewer/outsider RLS';`);
    process.stdout.write(results);
    sql(`INSERT INTO public.turns(id,thread_id,author_id,author_type,mode,user_message,status) VALUES
      ('99999999-9999-9999-9999-999999999999','dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-1111-1111-1111-111111111111','user','free-chat','Race','running');`);
    const auth = "SET ROLE authenticated; SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';";
    const final = concurrentSql(`${auth} BEGIN; UPDATE public.turns SET status='completed',assistant_message='Race final' WHERE id='99999999-9999-9999-9999-999999999999'; SELECT pg_sleep(0.3); COMMIT;`);
    await new Promise(resolve => setTimeout(resolve, 60));
    const stale = concurrentSql(`${auth} UPDATE public.turns SET status='running',assistant_message='' WHERE id='99999999-9999-9999-9999-999999999999';`);
    await Promise.all([final, stale]);
    sql(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.turns WHERE id='99999999-9999-9999-9999-999999999999' AND status='completed' AND assistant_message='Race final') THEN RAISE EXCEPTION 'concurrent stale update regressed final'; END IF; END $$;`);
    process.stdout.write('PASS: concurrent final commit versus blocked stale running update; peer editor legacy DELETE preserves tombstone.\n');
    sql(`${auth} DELETE FROM public.projects WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      RESET ROLE;
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM public.projects WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
          OR EXISTS(SELECT 1 FROM public.libraries WHERE project_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
          OR EXISTS(SELECT 1 FROM public.library_items WHERE library_id IN ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','cccccccc-cccc-cccc-cccc-cccccccccccc'))
          OR EXISTS(SELECT 1 FROM public.project_members WHERE project_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
        THEN RAISE EXCEPTION 'parent deletion left child rows'; END IF;
      END $$;`);
    process.stdout.write('PASS: normal owner project deletion cascades through tombstoned/live libraries, memberships and project members.\n');
    sql(`INSERT INTO public.projects(id,org_id,owner_id,name) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','aaaaaaaa-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111111','Org cascade child');
      INSERT INTO public.project_members(project_id,user_id,role) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','11111111-1111-1111-1111-111111111111','owner');
      INSERT INTO public.libraries(id,project_id,name) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Org cascade library');
      INSERT INTO public.library_items(library_id,item_type,item_id,added_by) SELECT 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','paper',id,'11111111-1111-1111-1111-111111111111' FROM public.papers WHERE canonical_key='doi:fixture/shared';
      DELETE FROM public.orgs WHERE id='aaaaaaaa-0000-0000-0000-000000000000';
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM public.projects WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
          OR EXISTS(SELECT 1 FROM public.libraries WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1')
          OR EXISTS(SELECT 1 FROM public.library_items WHERE library_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1')
          OR EXISTS(SELECT 1 FROM public.project_members WHERE project_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')
        THEN RAISE EXCEPTION 'org cascade left child rows'; END IF;
      END $$;`);
    process.stdout.write('PASS: database-owner org deletion also cascades fully; no new end-user org-delete permission is added.\n');
    process.stdout.write('PostgreSQL 17, CPU 1, memory 384MiB, no network/ports, isolated temporary DB. Optional unused vector extension omitted; minimal auth.uid() fixture, not hosted Auth/Realtime.\n');
  } finally {
    const cleanup = spawnSync(docker, ['--context', 'desktop-linux', 'rm', '-f', name], { encoding: 'utf8', timeout: 15_000 });
    process.stdout.write(`Own container cleanup: ${cleanup.status === 0 ? 'removed' : cleanup.stderr.trim()}\n`);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
