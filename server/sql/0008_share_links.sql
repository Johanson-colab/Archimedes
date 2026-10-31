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
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.project_role(p_project, v_user) not in ('editor', 'admin', 'owner') then
    raise exception 'You do not have permission to share this resource.' using errcode = '42501';
  end if;
  if p_resource_type not in ('thread', 'paper', 'review', 'artifact') then raise exception 'Unknown share resource type.'; end if;
  if p_role not in ('viewer', 'commenter') then raise exception 'Unknown share role.'; end if;
  if p_expires_at <= now() then raise exception 'Share links must expire in the future.'; end if;
  if length(p_token_hash) <> 64 then raise exception 'Invalid share token.'; end if;
  insert into public.share_links (project_id, resource_type, resource_id, token_hash, role, created_by, expires_at)
  values (p_project, p_resource_type, p_resource_id, p_token_hash, p_role, v_user, p_expires_at)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_share_link(uuid, text, uuid, text, text, timestamptz) from public;
revoke execute on function public.create_share_link(uuid, text, uuid, text, text, timestamptz) from anon;
grant execute on function public.create_share_link(uuid, text, uuid, text, text, timestamptz) to authenticated;

create or replace function public.revoke_share_link(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_link public.share_links%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select * into v_link from public.share_links where id = p_id;
  if v_link is null then raise exception 'Share link not found.'; end if;
  if v_link.created_by <> v_user and public.project_role(v_link.project_id, v_user) not in ('admin', 'owner') then
    raise exception 'You do not have permission to revoke this share link.' using errcode = '42501';
  end if;
  update public.share_links set revoked_at = now() where id = p_id;
end;
$$;

revoke all on function public.revoke_share_link(uuid) from public;
revoke execute on function public.revoke_share_link(uuid) from anon;
grant execute on function public.revoke_share_link(uuid) to authenticated;

create or replace function public.redeem_share_link(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link public.share_links%rowtype;
begin
  select * into v_link
  from public.share_links
  where token_hash = p_token_hash and revoked_at is null and expires_at > now();
  if v_link is null then return null; end if;
  if v_link.resource_type <> 'thread' then
    return jsonb_build_object(
      'id', v_link.id, 'project_id', v_link.project_id, 'resource_type', v_link.resource_type,
      'resource_id', v_link.resource_id, 'role', v_link.role, 'expires_at', v_link.expires_at
    );
  end if;
  return (
    select jsonb_build_object(
      'id', v_link.id,
      'project_id', v_link.project_id,
      'resource_type', v_link.resource_type,
      'resource_id', v_link.resource_id,
      'role', v_link.role,
      'expires_at', v_link.expires_at,
      'thread', to_jsonb(t),
      'turns', coalesce((select jsonb_agg(to_jsonb(turn) order by turn.created_at) from public.turns turn where turn.thread_id = t.id), '[]'::jsonb),
      'events', coalesce((select jsonb_agg(to_jsonb(event) order by event.sequence) from public.events event where event.thread_id = t.id), '[]'::jsonb),
      'comments', coalesce((select jsonb_agg(to_jsonb(comment) order by comment.created_at) from public.comments comment where comment.project_id = t.project_id and comment.resource_type = 'thread' and comment.resource_id = t.id), '[]'::jsonb)
    )
    from public.threads t
    where t.id = v_link.resource_id
  );
end;
$$;

revoke all on function public.redeem_share_link(text) from public;
grant execute on function public.redeem_share_link(text) to anon, authenticated;
