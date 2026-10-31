-- Project/member API helpers. SECURITY DEFINER is scoped to auth.uid() and
-- revoked from anon; the API still performs its own role checks.

create or replace function public.create_project(p_name text, p_description text default '')
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_project uuid;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 100 then
    raise exception 'A project name of at most 100 characters is required.';
  end if;

  select org_id into v_org
  from public.org_members
  where user_id = v_user
  order by joined_at asc
  limit 1;

  if v_org is null then
    insert into public.orgs (name, plan) values ('Personal', 'free') returning id into v_org;
    insert into public.org_members (org_id, user_id, role) values (v_org, v_user, 'owner');
  end if;

  insert into public.projects (org_id, owner_id, name, description)
  values (v_org, v_user, trim(p_name), coalesce(p_description, ''))
  returning id into v_project;

  insert into public.project_members (project_id, user_id, role)
  values (v_project, v_user, 'owner');

  return v_project;
end;
$$;

revoke all on function public.create_project(text, text) from public;
grant execute on function public.create_project(text, text) to authenticated;

create or replace function public.add_project_member_by_email(p_project uuid, p_email text, p_role text default 'viewer')
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_target uuid;
  v_role text := coalesce(nullif(p_role, ''), 'viewer');
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.project_role(p_project, v_user) not in ('admin', 'owner') then
    raise exception 'You do not have permission to add project members.' using errcode = '42501';
  end if;
  if v_role not in ('viewer', 'commenter', 'editor', 'admin') then
    raise exception 'Unknown project role.';
  end if;
  select id into v_target from public.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_target is null then raise exception 'No Archimedes account exists for that email.'; end if;
  insert into public.project_members (project_id, user_id, role, invited_by)
  values (p_project, v_target, v_role, v_user)
  on conflict (project_id, user_id) do update set role = excluded.role;
  return v_target;
end;
$$;

revoke all on function public.add_project_member_by_email(uuid, text, text) from public;
grant execute on function public.add_project_member_by_email(uuid, text, text) to authenticated;
