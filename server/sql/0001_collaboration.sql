-- Archimedes collaboration schema (PostgreSQL / Supabase)
-- This is the contract for the cloud and LAN API. Local SQLite keeps its own
-- outbox and uses UUIDv7 for shared rows.

begin;

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Identity / tenancy
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  avatar_color text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'free' check (plan in ('free','pro','team','enterprise')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('member','admin','owner')),
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  owner_id uuid not null references public.users(id),
  name text not null,
  description text not null default '',
  default_thread_visibility text not null default 'project' check (default_thread_visibility in ('project','private')),
  workspace_mode text not null default 'local' check (workspace_mode in ('local','cloud','snapshot')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('viewer','commenter','editor','admin','owner')),
  joined_at timestamptz not null default now(),
  invited_by uuid references public.users(id),
  primary key (project_id, user_id)
);

create table if not exists public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null,
  role text not null check (role in ('viewer','commenter','editor','admin')),
  token_hash text not null unique,
  invited_by uuid not null references public.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Libraries / papers
-- ---------------------------------------------------------------------------

create table if not exists public.libraries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text not null default '',
  color text not null default '#3973c8',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.papers (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  title text not null,
  authors_json jsonb not null default '[]'::jsonb,
  year integer,
  venue text not null default '',
  abstract text not null default '',
  url text not null default '',
  pdf_url text not null default '',
  doi text not null default '',
  arxiv_id text not null default '',
  s2_id text not null default '',
  source text not null default 'manual',
  citation_count integer not null default 0,
  github_url text not null default '',
  github_stars integer not null default 0,
  conference_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.library_items (
  library_id uuid not null references public.libraries(id) on delete cascade,
  item_type text not null check (item_type in ('paper','dataset','repo','web')),
  item_id uuid not null,
  added_by uuid not null references public.users(id),
  added_at timestamptz not null default now(),
  note text not null default '',
  primary key (library_id, item_type, item_id)
);

create table if not exists public.paper_user_state (
  paper_id uuid not null references public.papers(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  reading_status text not null default 'unread' check (reading_status in ('unread','reading','read')),
  starred boolean not null default false,
  notes text not null default '',
  tags_json jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (paper_id, user_id)
);

create table if not exists public.paper_highlights (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,
  author_id uuid not null references public.users(id),
  visibility text not null default 'project' check (visibility in ('project','private')),
  page_number integer not null,
  quote text not null,
  start_offset integer,
  end_offset integer,
  note text not null default '',
  color text not null default 'green',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.paper_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,
  owner_id uuid not null references public.users(id),
  visibility text not null default 'private' check (visibility in ('private','project')),
  review_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, paper_id, owner_id)
);

create table if not exists public.paper_presentations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,
  owner_id uuid not null references public.users(id),
  visibility text not null default 'private' check (visibility in ('private','project')),
  presentation_json jsonb not null,
  source_review_updated_at text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, paper_id, owner_id)
);

-- ---------------------------------------------------------------------------
-- Threads / comments / sharing
-- ---------------------------------------------------------------------------

create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.users(id),
  visibility text not null default 'project' check (visibility in ('project','private')),
  title text not null,
  mode text not null,
  status text not null default 'idle',
  context_summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.turns (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  author_id uuid not null references public.users(id),
  author_type text not null check (author_type in ('user','agent','system')),
  mode text not null,
  user_message text not null,
  assistant_message text not null default '',
  status text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  turn_id uuid not null references public.turns(id) on delete cascade,
  sequence bigint not null,
  actor_id uuid references public.users(id),
  actor_type text not null default 'user' check (actor_type in ('user','agent','system')),
  type text not null,
  payload_json jsonb not null,
  client_event_id text,
  created_at timestamptz not null default now(),
  unique (thread_id, sequence),
  unique (thread_id, client_event_id)
);

create table if not exists public.paper_chat_threads (
  project_id uuid not null references public.projects(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, paper_id)
);

create table if not exists public.thread_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  owner_id uuid not null references public.users(id),
  sequence bigint not null default 0,
  manifest_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  resource_type text not null check (resource_type in ('thread','paper','review','artifact')),
  resource_id uuid not null,
  parent_id uuid references public.comments(id) on delete cascade,
  anchor_json jsonb not null default '{}'::jsonb,
  body text not null,
  author_id uuid not null references public.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  resource_type text not null check (resource_type in ('thread','paper','review','artifact')),
  resource_id uuid not null,
  token_hash text not null unique,
  role text not null default 'viewer' check (role in ('viewer','commenter')),
  created_by uuid not null references public.users(id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Agent collaboration
-- ---------------------------------------------------------------------------

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  driver_id uuid not null references public.users(id),
  status text not null default 'running' check (status in ('running','paused','completed','failed','interrupted')),
  context_manifest_json jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.run_participants (
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('driver','co_prompt','observer')),
  joined_at timestamptz not null default now(),
  primary key (run_id, user_id)
);

create table if not exists public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete set null,
  turn_id uuid references public.turns(id) on delete set null,
  kind text not null check (kind in ('write','command')),
  payload_json jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid not null references public.users(id),
  approved_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Audit / sync change log
-- ---------------------------------------------------------------------------

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  actor_id uuid references public.users(id),
  actor_type text not null default 'user' check (actor_type in ('user','agent','system')),
  action text not null,
  target_type text not null,
  target_id text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.project_change_log (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null check (operation in ('upsert','delete')),
  payload_json jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_project_members_user on public.project_members(user_id, project_id);
create index if not exists idx_libraries_project on public.libraries(project_id, updated_at desc);
create index if not exists idx_library_items_item on public.library_items(item_type, item_id);
create index if not exists idx_paper_highlights_project on public.paper_highlights(project_id, paper_id, page_number);
create index if not exists idx_paper_reviews_project on public.paper_reviews(project_id, paper_id);
create index if not exists idx_paper_presentations_project on public.paper_presentations(project_id, paper_id);
create index if not exists idx_threads_project on public.threads(project_id, updated_at desc);
create index if not exists idx_turns_thread on public.turns(thread_id, created_at);
create index if not exists idx_events_thread on public.events(thread_id, sequence);
create index if not exists idx_comments_resource on public.comments(project_id, resource_type, resource_id, created_at);
create index if not exists idx_agent_runs_thread on public.agent_runs(thread_id, started_at desc);
create index if not exists idx_audit_events_project on public.audit_events(project_id, created_at desc);
create index if not exists idx_change_log_project on public.project_change_log(project_id, id);
create index if not exists idx_share_links_project on public.share_links(project_id, expires_at);

-- ---------------------------------------------------------------------------
-- Updated-at trigger
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'users','orgs','projects','libraries','papers','paper_user_state',
    'paper_highlights','paper_reviews','paper_presentations','threads',
    'paper_chat_threads','comments'
  ] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$I', table_name);
    execute format('create trigger trg_touch_%1$s before update on public.%1$I for each row execute function public.touch_updated_at()', table_name);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auth users mirror
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.users (id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'Researcher'), coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

create or replace function public.project_role(p_project uuid, p_user uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.project_members where project_id = p_project and user_id = p_user;
$$;
revoke all on function public.project_role(uuid, uuid) from public;
grant execute on function public.project_role(uuid, uuid) to authenticated;

create or replace function public.is_project_member(p_project uuid, p_user uuid)
returns boolean language sql stable as $$
  select public.project_role(p_project, p_user) is not null;
$$;
grant execute on function public.is_project_member(uuid, uuid) to authenticated;

create or replace function public.can_read_thread(p_thread uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.threads t
    where t.id = p_thread
      and public.is_project_member(t.project_id, p_user)
      and (t.visibility = 'project' or t.owner_id = p_user)
  );
$$;
revoke all on function public.can_read_thread(uuid, uuid) from public;
grant execute on function public.can_read_thread(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS policies (defense-in-depth; the API remains the primary enforcement)
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;
alter table public.libraries enable row level security;
alter table public.papers enable row level security;
alter table public.library_items enable row level security;
alter table public.paper_user_state enable row level security;
alter table public.paper_highlights enable row level security;
alter table public.paper_reviews enable row level security;
alter table public.paper_presentations enable row level security;
alter table public.threads enable row level security;
alter table public.turns enable row level security;
alter table public.events enable row level security;
alter table public.paper_chat_threads enable row level security;
alter table public.thread_snapshots enable row level security;
alter table public.comments enable row level security;
alter table public.share_links enable row level security;
alter table public.agent_runs enable row level security;
alter table public.run_participants enable row level security;
alter table public.agent_actions enable row level security;
alter table public.audit_events enable row level security;
alter table public.project_change_log enable row level security;

drop policy if exists users_self on public.users;
create policy users_self on public.users for select to authenticated using (id = auth.uid());

drop policy if exists orgs_member_read on public.orgs;
create policy orgs_member_read on public.orgs for select to authenticated
using (exists (select 1 from public.org_members m where m.org_id = orgs.id and m.user_id = auth.uid()));

drop policy if exists org_members_read on public.org_members;
create policy org_members_read on public.org_members for select to authenticated
using (user_id = auth.uid() or exists (select 1 from public.org_members m where m.org_id = org_members.org_id and m.user_id = auth.uid() and m.role in ('admin','owner')));

drop policy if exists projects_member_read on public.projects;
create policy projects_member_read on public.projects for select to authenticated
using (public.is_project_member(id, auth.uid()));
drop policy if exists projects_owner_insert on public.projects;
create policy projects_owner_insert on public.projects for insert to authenticated
with check (owner_id = auth.uid());
drop policy if exists projects_editor_update on public.projects;
create policy projects_editor_update on public.projects for update to authenticated
using (public.project_role(id, auth.uid()) in ('editor','admin','owner'))
with check (public.project_role(id, auth.uid()) in ('editor','admin','owner'));
drop policy if exists projects_owner_delete on public.projects;
create policy projects_owner_delete on public.projects for delete to authenticated
using (public.project_role(id, auth.uid()) = 'owner');

drop policy if exists project_members_read on public.project_members;
create policy project_members_read on public.project_members for select to authenticated
using (public.is_project_member(project_id, auth.uid()));
drop policy if exists project_members_manage on public.project_members;
create policy project_members_manage on public.project_members for all to authenticated
using (public.project_role(project_id, auth.uid()) in ('admin','owner'))
with check (public.project_role(project_id, auth.uid()) in ('admin','owner'));

drop policy if exists libraries_read on public.libraries;
create policy libraries_read on public.libraries for select to authenticated
using (public.is_project_member(project_id, auth.uid()));
drop policy if exists libraries_write on public.libraries;
create policy libraries_write on public.libraries for all to authenticated
using (public.project_role(project_id, auth.uid()) in ('editor','admin','owner'))
with check (public.project_role(project_id, auth.uid()) in ('editor','admin','owner'));

drop policy if exists paper_user_state_self on public.paper_user_state;
create policy paper_user_state_self on public.paper_user_state for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists highlights_read on public.paper_highlights;
create policy highlights_read on public.paper_highlights for select to authenticated
using (public.is_project_member(project_id, auth.uid()) and (visibility = 'project' or author_id = auth.uid()));
drop policy if exists highlights_write on public.paper_highlights;
create policy highlights_write on public.paper_highlights for all to authenticated
using (public.project_role(project_id, auth.uid()) in ('commenter','editor','admin','owner') and (author_id = auth.uid() or public.project_role(project_id, auth.uid()) in ('editor','admin','owner')))
with check (author_id = auth.uid() and public.project_role(project_id, auth.uid()) in ('commenter','editor','admin','owner'));

drop policy if exists reviews_read on public.paper_reviews;
create policy reviews_read on public.paper_reviews for select to authenticated
using (public.is_project_member(project_id, auth.uid()) and (owner_id = auth.uid() or visibility = 'project'));
drop policy if exists reviews_write on public.paper_reviews;
create policy reviews_write on public.paper_reviews for all to authenticated
using (owner_id = auth.uid() and public.project_role(project_id, auth.uid()) in ('editor','admin','owner'))
with check (owner_id = auth.uid() and public.project_role(project_id, auth.uid()) in ('editor','admin','owner'));

drop policy if exists presentations_read on public.paper_presentations;
create policy presentations_read on public.paper_presentations for select to authenticated
using (public.is_project_member(project_id, auth.uid()) and (owner_id = auth.uid() or visibility = 'project'));
drop policy if exists presentations_write on public.paper_presentations;
create policy presentations_write on public.paper_presentations for all to authenticated
using (owner_id = auth.uid() and public.project_role(project_id, auth.uid()) in ('editor','admin','owner'))
with check (owner_id = auth.uid() and public.project_role(project_id, auth.uid()) in ('editor','admin','owner'));

drop policy if exists threads_read on public.threads;
create policy threads_read on public.threads for select to authenticated
using (public.can_read_thread(id, auth.uid()));
drop policy if exists threads_write on public.threads;
create policy threads_write on public.threads for all to authenticated
using ((visibility = 'project' or owner_id = auth.uid()) and public.project_role(project_id, auth.uid()) in ('editor','admin','owner'))
with check (public.project_role(project_id, auth.uid()) in ('editor','admin','owner'));

drop policy if exists turns_read on public.turns;
create policy turns_read on public.turns for select to authenticated
using (public.can_read_thread(thread_id, auth.uid()));
drop policy if exists turns_write on public.turns;
create policy turns_write on public.turns for all to authenticated
using (public.can_read_thread(thread_id, auth.uid()) and exists (select 1 from public.threads t where t.id = thread_id and public.project_role(t.project_id, auth.uid()) in ('editor','admin','owner')))
with check (author_id = auth.uid());

drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated
using (public.can_read_thread(thread_id, auth.uid()));
drop policy if exists events_write on public.events;
create policy events_write on public.events for all to authenticated
using (public.can_read_thread(thread_id, auth.uid()) and exists (select 1 from public.threads t where t.id = thread_id and public.project_role(t.project_id, auth.uid()) in ('editor','admin','owner')))
with check (actor_id = auth.uid());

drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select to authenticated
using (public.is_project_member(project_id, auth.uid()) and (resource_type <> 'thread' or public.can_read_thread(resource_id, auth.uid())));
drop policy if exists comments_write on public.comments;
create policy comments_write on public.comments for all to authenticated
using (public.project_role(project_id, auth.uid()) in ('commenter','editor','admin','owner') and (author_id = auth.uid() or public.project_role(project_id, auth.uid()) in ('editor','admin','owner')))
with check (author_id = auth.uid() and public.project_role(project_id, auth.uid()) in ('commenter','editor','admin','owner'));

drop policy if exists snapshots_read on public.thread_snapshots;
create policy snapshots_read on public.thread_snapshots for select to authenticated
using (public.can_read_thread(thread_id, auth.uid()));
drop policy if exists snapshots_write on public.thread_snapshots;
create policy snapshots_write on public.thread_snapshots for insert to authenticated
with check (owner_id = auth.uid() and public.can_read_thread(thread_id, auth.uid()) and public.project_role(project_id, auth.uid()) in ('editor','admin','owner'));

drop policy if exists runs_read on public.agent_runs;
create policy runs_read on public.agent_runs for select to authenticated
using (public.is_project_member(project_id, auth.uid()));
drop policy if exists runs_write on public.agent_runs;
create policy runs_write on public.agent_runs for all to authenticated
using (driver_id = auth.uid() and public.project_role(project_id, auth.uid()) in ('editor','admin','owner'))
with check (driver_id = auth.uid());

drop policy if exists actions_read on public.agent_actions;
create policy actions_read on public.agent_actions for select to authenticated
using (public.is_project_member(project_id, auth.uid()));
drop policy if exists actions_write on public.agent_actions;
create policy actions_write on public.agent_actions for all to authenticated
using (public.project_role(project_id, auth.uid()) in ('editor','admin','owner'))
with check (requested_by = auth.uid() and public.project_role(project_id, auth.uid()) in ('editor','admin','owner'));

drop policy if exists library_items_read on public.library_items;
create policy library_items_read on public.library_items for select to authenticated
using (exists (select 1 from public.libraries l where l.id = library_id and public.is_project_member(l.project_id, auth.uid())));
drop policy if exists library_items_write on public.library_items;
create policy library_items_write on public.library_items for all to authenticated
using (exists (select 1 from public.libraries l where l.id = library_id and public.project_role(l.project_id, auth.uid()) in ('editor','admin','owner')))
with check (added_by = auth.uid());

drop policy if exists papers_read on public.papers;
create policy papers_read on public.papers for select to authenticated
using (exists (
  select 1 from public.library_items i join public.libraries l on l.id = i.library_id
  where i.item_type = 'paper' and i.item_id = papers.id and public.is_project_member(l.project_id, auth.uid())
));

drop policy if exists paper_chat_threads_read on public.paper_chat_threads;
create policy paper_chat_threads_read on public.paper_chat_threads for select to authenticated
using (public.is_project_member(project_id, auth.uid()) and public.can_read_thread(thread_id, auth.uid()));

drop policy if exists run_participants_read on public.run_participants;
create policy run_participants_read on public.run_participants for select to authenticated
using (exists (select 1 from public.agent_runs r where r.id = run_id and public.is_project_member(r.project_id, auth.uid())));
drop policy if exists run_participants_write on public.run_participants;
create policy run_participants_write on public.run_participants for all to authenticated
using (exists (select 1 from public.agent_runs r where r.id = run_id and r.driver_id = auth.uid()))
with check (user_id = auth.uid());

drop policy if exists audit_admin_read on public.audit_events;
create policy audit_admin_read on public.audit_events for select to authenticated
using (public.project_role(project_id, auth.uid()) in ('admin','owner'));

drop policy if exists change_log_read on public.project_change_log;
create policy change_log_read on public.project_change_log for select to authenticated
using (public.is_project_member(project_id, auth.uid()));

drop policy if exists invites_admin on public.project_invites;
create policy invites_admin on public.project_invites for all to authenticated
using (public.project_role(project_id, auth.uid()) in ('admin','owner'))
with check (public.project_role(project_id, auth.uid()) in ('admin','owner'));

drop policy if exists share_links_admin on public.share_links;
create policy share_links_admin on public.share_links for all to authenticated
using (public.project_role(project_id, auth.uid()) in ('admin','owner'))
with check (public.project_role(project_id, auth.uid()) in ('admin','owner'));

commit;
