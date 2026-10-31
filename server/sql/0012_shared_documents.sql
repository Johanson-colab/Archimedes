create table if not exists public.shared_documents (
  project_id uuid not null references public.projects(id) on delete cascade,
  doc_key text not null,
  state_base64 text not null default '',
  version bigint not null default 0,
  updated_by uuid not null references public.users(id),
  updated_at timestamptz not null default now(),
  primary key (project_id, doc_key)
);

alter table public.shared_documents enable row level security;
drop policy if exists shared_documents_read on public.shared_documents;
create policy shared_documents_read on public.shared_documents for select to authenticated
using (public.is_project_member(project_id, auth.uid()));

create or replace function public.upsert_shared_document(
  p_project uuid,
  p_key text,
  p_state_base64 text,
  p_expected_version bigint
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_current bigint;
  v_next bigint;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if public.project_role(p_project, v_user) not in ('editor','admin','owner') then
    raise exception 'You do not have permission to edit this project note.' using errcode = '42501';
  end if;
  if p_key is null or length(p_key) = 0 or length(p_key) > 200 then raise exception 'Invalid document key.'; end if;
  if length(p_state_base64) > 5000000 then raise exception 'Document state is too large.'; end if;

  select version into v_current from public.shared_documents
  where project_id = p_project and doc_key = p_key
  for update;
  if v_current is null then
    if coalesce(p_expected_version, 0) <> 0 then raise exception 'Document changed; retry.' using errcode = '40001'; end if;
    insert into public.shared_documents (project_id, doc_key, state_base64, version, updated_by, updated_at)
    values (p_project, p_key, p_state_base64, 1, v_user, now());
    v_next := 1;
  else
    if p_expected_version <> v_current then raise exception 'Document changed; retry.' using errcode = '40001'; end if;
    update public.shared_documents set state_base64 = p_state_base64, version = version + 1, updated_by = v_user, updated_at = now()
    where project_id = p_project and doc_key = p_key;
    v_next := v_current + 1;
  end if;
  return jsonb_build_object('version', v_next, 'state_base64', p_state_base64, 'updated_at', now());
end;
$$;

revoke all on function public.upsert_shared_document(uuid, text, text, bigint) from public;
revoke execute on function public.upsert_shared_document(uuid, text, text, bigint) from anon;
grant execute on function public.upsert_shared_document(uuid, text, text, bigint) to authenticated;
