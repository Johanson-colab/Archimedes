create or replace function public.create_share_link(
  p_project uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_role text,
  p_token_hash text,
  p_expires_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_allowed boolean := false;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.project_role(p_project, v_user) not in ('editor', 'admin', 'owner') then
    raise exception 'You do not have permission to share this resource.' using errcode = '42501';
  end if;
  if p_resource_type not in ('thread', 'paper', 'review', 'artifact') then raise exception 'Unknown share resource type.'; end if;
  if p_role not in ('viewer', 'commenter') then raise exception 'Unknown share role.'; end if;
  if p_expires_at <= now() then raise exception 'Share links must expire in the future.'; end if;
  if length(p_token_hash) <> 64 then raise exception 'Invalid share token.'; end if;

  if p_resource_type = 'thread' then
    select exists(select 1 from public.threads t where t.id = p_resource_id and t.project_id = p_project) into v_allowed;
  elsif p_resource_type = 'paper' then
    select exists(
      select 1 from public.library_items i
      join public.libraries l on l.id = i.library_id
      where i.item_type = 'paper' and i.item_id = p_resource_id and l.project_id = p_project
    ) into v_allowed;
  elsif p_resource_type = 'review' then
    select exists(select 1 from public.paper_reviews r where r.id = p_resource_id and r.project_id = p_project) into v_allowed;
  end if;
  if not v_allowed then raise exception 'The shared resource does not belong to this project.'; end if;

  insert into public.share_links (project_id, resource_type, resource_id, token_hash, role, created_by, expires_at)
  values (p_project, p_resource_type, p_resource_id, p_token_hash, p_role, v_user, p_expires_at)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_share_link(uuid, text, uuid, text, text, timestamptz) from public;
revoke execute on function public.create_share_link(uuid, text, uuid, text, text, timestamptz) from anon;
grant execute on function public.create_share_link(uuid, text, uuid, text, text, timestamptz) to authenticated;
