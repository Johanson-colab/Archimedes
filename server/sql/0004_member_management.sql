create or replace function public.update_project_member_role(p_project uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_current text;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.project_role(p_project, v_user) not in ('admin', 'owner') then
    raise exception 'You do not have permission to change project members.' using errcode = '42501';
  end if;
  if p_role not in ('viewer', 'commenter', 'editor', 'admin') then
    raise exception 'Unknown project role.';
  end if;
  select role into v_current from public.project_members where project_id = p_project and user_id = p_user;
  if v_current is null then raise exception 'Project member not found.'; end if;
  if v_current = 'owner' then raise exception 'Project ownership cannot be changed here.'; end if;
  update public.project_members set role = p_role where project_id = p_project and user_id = p_user;
end;
$$;

revoke all on function public.update_project_member_role(uuid, uuid, text) from public;
revoke execute on function public.update_project_member_role(uuid, uuid, text) from anon;
grant execute on function public.update_project_member_role(uuid, uuid, text) to authenticated;

create or replace function public.remove_project_member(p_project uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_current text;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.project_role(p_project, v_user) not in ('admin', 'owner') then
    raise exception 'You do not have permission to remove project members.' using errcode = '42501';
  end if;
  select role into v_current from public.project_members where project_id = p_project and user_id = p_user;
  if v_current is null then raise exception 'Project member not found.'; end if;
  if v_current = 'owner' then raise exception 'The project owner cannot be removed.'; end if;
  delete from public.project_members where project_id = p_project and user_id = p_user;
end;
$$;

revoke all on function public.remove_project_member(uuid, uuid) from public;
revoke execute on function public.remove_project_member(uuid, uuid) from anon;
grant execute on function public.remove_project_member(uuid, uuid) to authenticated;
