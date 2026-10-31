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
  v_title text := nullif(trim(p_paper->>'title'), '');
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select project_id into v_project from public.libraries where id = p_library;
  if v_project is null then raise exception 'Library not found.'; end if;
  if public.project_role(v_project, v_user) not in ('editor', 'admin', 'owner') then
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
  on conflict (canonical_key) do update set
    title = excluded.title,
    authors_json = case when excluded.authors_json = '[]'::jsonb then papers.authors_json else excluded.authors_json end,
    year = coalesce(excluded.year, papers.year),
    venue = case when excluded.venue = '' then papers.venue else excluded.venue end,
    abstract = case when excluded.abstract = '' then papers.abstract else excluded.abstract end,
    url = case when excluded.url = '' then papers.url else excluded.url end,
    pdf_url = case when excluded.pdf_url = '' then papers.pdf_url else excluded.pdf_url end,
    doi = case when excluded.doi = '' then papers.doi else excluded.doi end,
    arxiv_id = case when excluded.arxiv_id = '' then papers.arxiv_id else excluded.arxiv_id end,
    s2_id = case when excluded.s2_id = '' then papers.s2_id else excluded.s2_id end,
    citation_count = greatest(papers.citation_count, excluded.citation_count),
    github_url = case when excluded.github_url = '' then papers.github_url else excluded.github_url end,
    github_stars = greatest(papers.github_stars, excluded.github_stars),
    conference_json = coalesce(excluded.conference_json, papers.conference_json),
    updated_at = now()
  returning id into v_paper;

  insert into public.library_items (library_id, item_type, item_id, added_by, note)
  values (p_library, 'paper', v_paper, v_user, coalesce(p_paper->>'note', ''))
  on conflict (library_id, item_type, item_id) do nothing;

  return v_paper;
end;
$$;

revoke all on function public.upsert_paper_to_library(uuid, jsonb) from public;
revoke execute on function public.upsert_paper_to_library(uuid, jsonb) from anon;
grant execute on function public.upsert_paper_to_library(uuid, jsonb) to authenticated;
