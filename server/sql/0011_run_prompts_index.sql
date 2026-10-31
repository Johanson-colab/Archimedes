create index if not exists idx_run_prompts_pending on public.run_prompts(run_id, created_at) where status = 'pending';
create index if not exists idx_run_prompts_author on public.run_prompts(author_id);
create index if not exists idx_run_prompts_project on public.run_prompts(project_id);
