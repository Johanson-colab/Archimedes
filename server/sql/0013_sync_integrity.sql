-- Apply after 0012. Existing rows acquire revision 1; terminal executions are
-- revision 2. A terminal turn ID is immutable; retry with a new execution ID.
begin;
alter table public.turns add column if not exists sync_revision bigint not null default 1;
update public.turns set sync_revision = 2 where status in ('completed','failed','incomplete','interrupted','needs_configuration','cancelled');

create or replace function public.merge_turn_revision()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.sync_revision := case when new.status in ('completed','failed','incomplete','interrupted','needs_configuration','cancelled') then 2 else 1 end;
  if tg_op = 'UPDATE' then
    if new.thread_id <> old.thread_id or new.author_id <> old.author_id then
      raise exception 'A turn cannot change conversation or author.' using errcode = '42501';
    end if;
    if old.sync_revision = 2 then return old; end if;
    if new.sync_revision = 1 and left(new.assistant_message, length(old.assistant_message)) <> old.assistant_message then return old; end if;
    new.mode := old.mode; new.user_message := old.user_message; new.created_at := old.created_at;
  end if;
  return new;
end; $$;
drop trigger if exists trg_merge_turn_revision on public.turns;
create trigger trg_merge_turn_revision before insert or update on public.turns for each row execute function public.merge_turn_revision();

create or replace function public.derived_thread_status(p_thread uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case when exists(select 1 from public.turns where thread_id = p_thread and status = 'running') then 'running'
    when (select status from public.turns where thread_id = p_thread order by created_at desc, id desc limit 1)
      in ('failed','incomplete','needs_configuration') then 'error' else 'idle' end;
$$;
revoke all on function public.derived_thread_status(uuid) from public, anon, authenticated;

create or replace function public.preserve_thread_execution_status()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if new.project_id <> old.project_id then raise exception 'A conversation cannot change project.' using errcode = '42501'; end if;
    new.owner_id := old.owner_id;
  end if;
  if exists(select 1 from public.turns where thread_id = new.id) then new.status := public.derived_thread_status(new.id); end if;
  return new;
end; $$;
drop trigger if exists trg_thread_execution_status on public.threads;
create trigger trg_thread_execution_status before insert or update on public.threads for each row execute function public.preserve_thread_execution_status();

create or replace function public.refresh_thread_execution_status()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.threads set status = public.derived_thread_status(new.thread_id), updated_at = now() where id = new.thread_id;
  return new;
end; $$;
drop trigger if exists trg_turn_execution_status on public.turns;
create trigger trg_turn_execution_status after insert or update on public.turns for each row execute function public.refresh_thread_execution_status();

-- Deletion applies to a library or one library/paper membership. Canonical
-- papers and their other memberships are retained. Old DELETE clients are
-- intercepted too, so reconnecting old clients cannot bypass the tombstone.
alter table public.libraries add column if not exists deleted_at timestamptz;
alter table public.libraries add column if not exists sync_revision bigint not null default 1;
alter table public.library_items add column if not exists deleted_at timestamptz;
alter table public.library_items add column if not exists sync_revision bigint not null default 1;
alter table public.library_items add column if not exists mutation_id text not null default '';

create or replace function public.soft_delete_synced_resource()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'libraries' then
    -- Parent removal is an authorized FK cascade, not a library delete intent.
    -- Keeping a tombstone after its project is gone would leave dangling rows.
    if not exists(select 1 from public.projects where id = old.project_id) then return old; end if;
    update public.libraries set deleted_at = coalesce(deleted_at, now()) where id = old.id and deleted_at is null;
  else
    if not exists(select 1 from public.libraries where id = old.library_id) then return old; end if;
    update public.library_items set deleted_at = coalesce(deleted_at, now())
      where library_id = old.library_id and item_type = old.item_type and item_id = old.item_id and deleted_at is null;
  end if;
  return null;
end; $$;
drop trigger if exists trg_library_soft_delete on public.libraries;
create trigger trg_library_soft_delete before delete on public.libraries for each row execute function public.soft_delete_synced_resource();
drop trigger if exists trg_item_soft_delete on public.library_items;
create trigger trg_item_soft_delete before delete on public.library_items for each row execute function public.soft_delete_synced_resource();

create or replace function public.guard_library_revision()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.project_id <> old.project_id then raise exception 'A library cannot change project.' using errcode = '42501'; end if;
  if old.deleted_at is not null then return old; end if;
  new.sync_revision := old.sync_revision + 1;
  return new;
end; $$;
drop trigger if exists trg_library_revision on public.libraries;
create trigger trg_library_revision before update on public.libraries for each row execute function public.guard_library_revision();

create or replace function public.guard_library_item_revision()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.library_id <> old.library_id or new.item_id <> old.item_id or new.item_type <> old.item_type then
    raise exception 'A library membership cannot change identity.' using errcode = '42501';
  end if;
  if old.deleted_at is not null and new.deleted_at is null and coalesce(current_setting('archimedes.restore_item', true), '') <> 'on' then
    raise exception 'This paper was removed. Refresh before explicitly adding it again.' using errcode = '40001';
  end if;
  if old.deleted_at is not null and new.deleted_at is not null then return old; end if;
  new.sync_revision := old.sync_revision + 1;
  return new;
end; $$;
drop trigger if exists trg_item_revision on public.library_items;
create trigger trg_item_revision before update on public.library_items for each row execute function public.guard_library_item_revision();

create or replace function public.library_sync_snapshot(p_project uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_project_member(p_project, auth.uid()) then raise exception 'Project access required.' using errcode = '42501'; end if;
  return jsonb_build_object('protocol', 2,
    'libraries', coalesce((select jsonb_agg(to_jsonb(l)) from public.libraries l where project_id = p_project), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('library_id', i.library_id, 'item_id', i.item_id,
      'canonical_key', p.canonical_key, 'sync_revision', i.sync_revision, 'deleted_at', i.deleted_at, 'mutation_id', i.mutation_id))
      from public.library_items i join public.libraries l on l.id = i.library_id left join public.papers p on p.id = i.item_id
      where l.project_id = p_project and i.item_type = 'paper'), '[]'::jsonb));
end; $$;

create or replace function public.delete_synced_library(p_library uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.libraries;
begin
  select * into v_row from public.libraries where id = p_library for update;
  if v_row.id is null or coalesce(public.project_role(v_row.project_id, auth.uid()), '') not in ('editor','admin','owner') then
    raise exception 'Library editor access required.' using errcode = '42501'; end if;
  update public.libraries set deleted_at = now() where id = p_library and deleted_at is null;
  select * into v_row from public.libraries where id = p_library;
  return to_jsonb(v_row);
end; $$;

create or replace function public.remove_synced_library_paper(p_library uuid, p_paper uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_project uuid; v_row public.library_items;
begin
  select project_id into v_project from public.libraries where id = p_library;
  if coalesce(public.project_role(v_project, auth.uid()), '') not in ('editor','admin','owner') then
    raise exception 'Library editor access required.' using errcode = '42501'; end if;
  select * into v_row from public.library_items where library_id = p_library and item_type = 'paper' and item_id = p_paper for update;
  if v_row.item_id is null then raise exception 'Library paper not found.'; end if;
  update public.library_items set deleted_at = now() where library_id = p_library and item_type = 'paper' and item_id = p_paper and deleted_at is null;
  select * into v_row from public.library_items where library_id = p_library and item_type = 'paper' and item_id = p_paper;
  return to_jsonb(v_row);
end; $$;

revoke all on function public.library_sync_snapshot(uuid), public.delete_synced_library(uuid), public.remove_synced_library_paper(uuid,uuid) from public, anon;
grant execute on function public.library_sync_snapshot(uuid), public.delete_synced_library(uuid), public.remove_synced_library_paper(uuid,uuid) to authenticated;

create or replace function public.upsert_paper_to_library(p_library uuid, p_paper jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_project uuid;
  v_paper uuid;
  v_key text := nullif(trim(p_paper->>'canonical_key'), '');
  v_item public.library_items;
  v_restore text;
  v_title text := nullif(trim(p_paper->>'title'), '');
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select project_id into v_project from public.libraries where id = p_library and deleted_at is null;
  if v_project is null then raise exception 'Library not found.'; end if;
  if coalesce(public.project_role(v_project, v_user), '') not in ('editor', 'admin', 'owner') then
    raise exception 'You do not have permission to add papers to this library.' using errcode = '42501';
  end if;
  if v_key is null or v_title is null then raise exception 'A paper canonical key and title are required.'; end if;

  insert into public.papers (
    canonical_key, title, authors_json, year, venue, abstract, url, pdf_url, doi, arxiv_id, s2_id,
    source, citation_count, github_url, github_stars, conference_json
  ) values (
    v_key, v_title,
    coalesce(p_paper->'authors_json', '[]'::jsonb),
    nullif(p_paper->>'year', '')::integer,
    coalesce(p_paper->>'venue', ''),
    coalesce(p_paper->>'abstract', ''),
    coalesce(p_paper->>'url', ''),
    coalesce(p_paper->>'pdf_url', ''),
    coalesce(p_paper->>'doi', ''),
    coalesce(p_paper->>'arxiv_id', ''),
    coalesce(p_paper->>'s2_id', ''),
    coalesce(nullif(p_paper->>'source', ''), 'manual'),
    coalesce(nullif(p_paper->>'citation_count', '')::integer, 0),
    coalesce(p_paper->>'github_url', ''),
    coalesce(nullif(p_paper->>'github_stars', '')::integer, 0),
    p_paper->'conference_json'
  )
  on conflict (canonical_key) do nothing;

  select id into v_paper from public.papers where canonical_key = v_key;

  -- Ordinary/legacy replays cannot resurrect a removed relation. A user
  -- re-add names the observed revision and is serialized with other adds.
  perform pg_advisory_xact_lock(hashtextextended(p_library::text || ':' || v_paper::text, 0));
  select * into v_item from public.library_items
    where library_id = p_library and item_type = 'paper' and item_id = v_paper for update;
  if v_item.item_id is not null and v_item.deleted_at is not null then
    if coalesce(p_paper->>'restore_revision', '') <> v_item.sync_revision::text then
      raise exception 'This paper was removed. Refresh before explicitly adding it again.' using errcode = '40001';
    end if;
    v_restore := coalesce(current_setting('archimedes.restore_item', true), '');
    perform set_config('archimedes.restore_item', 'on', true);
    update public.library_items set deleted_at = null, added_by = v_user, note = coalesce(p_paper->>'note', ''),
      mutation_id = coalesce(p_paper->>'mutation_id', '')
      where library_id = p_library and item_type = 'paper' and item_id = v_paper;
    perform set_config('archimedes.restore_item', v_restore, true);
  elsif v_item.item_id is null then
    insert into public.library_items (library_id, item_type, item_id, added_by, note, mutation_id)
    values (p_library, 'paper', v_paper, v_user, coalesce(p_paper->>'note', ''), coalesce(p_paper->>'mutation_id', ''));
  end if;

  return v_paper;
end;
$$;

revoke all on function public.upsert_paper_to_library(uuid, jsonb) from public;
revoke execute on function public.upsert_paper_to_library(uuid, jsonb) from anon;
grant execute on function public.upsert_paper_to_library(uuid, jsonb) to authenticated;

update public.threads t set status = public.derived_thread_status(t.id)
where exists (select 1 from public.turns r where r.thread_id = t.id)
  and t.status is distinct from public.derived_thread_status(t.id);
notify pgrst, 'reload schema';
commit;
