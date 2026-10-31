revoke execute on function public.create_project(text, text) from anon;
revoke execute on function public.add_project_member_by_email(uuid, text, text) from anon;

create or replace function public.list_project_members(p_project uuid)
returns table (
  user_id uuid,
  role text,
  display_name text,
  email text,
  joined_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.project_role(p_project, v_user) is null then
    raise exception 'You do not have access to this project.' using errcode = '42501';
  end if;
  return query
    select pm.user_id, pm.role, u.display_name, u.email, pm.joined_at
    from public.project_members pm
    join public.users u on u.id = pm.user_id
    where pm.project_id = p_project
    order by case pm.role when 'owner' then 0 when 'admin' then 1 when 'editor' then 2 when 'commenter' then 3 else 4 end, pm.joined_at asc;
end;
$$;

revoke all on function public.list_project_members(uuid) from public;
revoke execute on function public.list_project_members(uuid) from anon;
grant execute on function public.list_project_members(uuid) to authenticated;
