create table if not exists public.run_prompts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  author_id uuid not null references public.users(id),
  body text not null,
  status text not null default 'pending' check (status in ('pending','consumed','rejected')),
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  consumed_by uuid references public.users(id)
);

alter table public.run_prompts enable row level security;
drop policy if exists run_prompts_read on public.run_prompts;
create policy run_prompts_read on public.run_prompts for select to authenticated
using (public.is_project_member(project_id, auth.uid()));

create or replace function public.start_agent_run(p_project uuid, p_thread uuid, p_context jsonb default '{}'::jsonb)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_run uuid;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.project_role(p_project, v_user) not in ('editor','admin','owner') then
    raise exception 'You do not have permission to start an agent run.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.threads where id = p_thread and project_id = p_project) then
    raise exception 'The thread does not belong to this project.';
  end if;
  insert into public.agent_runs (project_id, thread_id, driver_id, status, context_manifest_json)
  values (p_project, p_thread, v_user, 'running', coalesce(p_context, '{}'::jsonb))
  returning id into v_run;
  insert into public.run_participants (run_id, user_id, role) values (v_run, v_user, 'driver');
  return v_run;
end;
$$;
revoke all on function public.start_agent_run(uuid, uuid, jsonb) from public;
revoke execute on function public.start_agent_run(uuid, uuid, jsonb) from anon;
grant execute on function public.start_agent_run(uuid, uuid, jsonb) to authenticated;

create or replace function public.join_agent_run(p_run uuid, p_role text default 'observer')
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_project uuid;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if p_role not in ('co_prompt','observer') then raise exception 'Join as co_prompt or observer.'; end if;
  select project_id into v_project from public.agent_runs where id = p_run;
  if v_project is null then raise exception 'Agent run not found.'; end if;
  if public.project_role(v_project, v_user) not in ('commenter','editor','admin','owner') then
    raise exception 'You do not have access to this run.' using errcode = '42501';
  end if;
  insert into public.run_participants (run_id, user_id, role) values (p_run, v_user, p_role)
  on conflict (run_id, user_id) do update set role = excluded.role;
end;
$$;
revoke all on function public.join_agent_run(uuid, text) from public;
revoke execute on function public.join_agent_run(uuid, text) from anon;
grant execute on function public.join_agent_run(uuid, text) to authenticated;

create or replace function public.enqueue_run_prompt(p_run uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_project uuid;
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select project_id into v_project from public.agent_runs where id = p_run;
  if v_project is null then raise exception 'Agent run not found.'; end if;
  if public.project_role(v_project, v_user) not in ('commenter','editor','admin','owner') then
    raise exception 'You do not have permission to co-prompt this run.' using errcode = '42501';
  end if;
  if p_body is null or length(trim(p_body)) = 0 or length(p_body) > 20000 then
    raise exception 'A co-prompt must be between 1 and 20000 characters.';
  end if;
  insert into public.run_prompts (project_id, run_id, author_id, body) values (v_project, p_run, v_user, trim(p_body))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.enqueue_run_prompt(uuid, text) from public;
revoke execute on function public.enqueue_run_prompt(uuid, text) from anon;
grant execute on function public.enqueue_run_prompt(uuid, text) to authenticated;

create or replace function public.claim_run_prompt(p_run uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row public.run_prompts%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not exists (select 1 from public.agent_runs where id = p_run and driver_id = v_user) then
    raise exception 'Only the run driver can claim co-prompts.' using errcode = '42501';
  end if;
  select * into v_row from public.run_prompts
  where run_id = p_run and status = 'pending'
  order by created_at asc
  for update skip locked limit 1;
  if v_row is null then return null; end if;
  update public.run_prompts set status = 'consumed', consumed_at = now(), consumed_by = v_user where id = v_row.id;
  return jsonb_build_object('id', v_row.id, 'author_id', v_row.author_id, 'body', v_row.body, 'created_at', v_row.created_at);
end;
$$;
revoke all on function public.claim_run_prompt(uuid) from public;
revoke execute on function public.claim_run_prompt(uuid) from anon;
grant execute on function public.claim_run_prompt(uuid) to authenticated;

create or replace function public.finish_agent_run(p_run uuid, p_status text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_project uuid;
  v_driver uuid;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select project_id, driver_id into v_project, v_driver from public.agent_runs where id = p_run;
  if v_project is null then raise exception 'Agent run not found.'; end if;
  if v_user <> v_driver and public.project_role(v_project, v_user) not in ('admin','owner') then
    raise exception 'Only the driver or a project admin can finish this run.' using errcode = '42501';
  end if;
  if p_status not in ('paused','completed','failed','interrupted') then raise exception 'Unknown run status.'; end if;
  update public.agent_runs set status = p_status, ended_at = case when p_status = 'paused' then null else now() end where id = p_run;
end;
$$;
revoke all on function public.finish_agent_run(uuid, text) from public;
revoke execute on function public.finish_agent_run(uuid, text) from anon;
grant execute on function public.finish_agent_run(uuid, text) to authenticated;

create or replace function public.resolve_agent_action(p_action uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_project uuid;
  v_status text;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select project_id, status into v_project, v_status from public.agent_actions where id = p_action;
  if v_project is null then raise exception 'Agent action not found.'; end if;
  if public.project_role(v_project, v_user) not in ('editor','admin','owner') then
    raise exception 'You do not have permission to resolve this action.' using errcode = '42501';
  end if;
  if v_status <> 'pending' then raise exception 'This action has already been resolved.'; end if;
  update public.agent_actions set status = case when p_approve then 'approved' else 'rejected' end,
    approved_by = case when p_approve then v_user else null end, resolved_at = now()
  where id = p_action;
end;
$$;
revoke all on function public.resolve_agent_action(uuid, boolean) from public;
revoke execute on function public.resolve_agent_action(uuid, boolean) from anon;
grant execute on function public.resolve_agent_action(uuid, boolean) to authenticated;
