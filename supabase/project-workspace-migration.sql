create table if not exists public.learning_steps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learning_steps_project_id_idx
  on public.learning_steps(project_id, sort_order);

alter table public.learning_steps enable row level security;

drop policy if exists "users manage own learning steps" on public.learning_steps;

create policy "users manage own learning steps" on public.learning_steps
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit
)
values (
  'project-files',
  'project-files',
  false,
  52428800
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "users read own project files" on storage.objects;
drop policy if exists "users insert own project files" on storage.objects;
drop policy if exists "users update own project files" on storage.objects;
drop policy if exists "users delete own project files" on storage.objects;

create policy "users read own project files" on storage.objects
  for select
  using (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users insert own project files" on storage.objects
  for insert
  with check (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users update own project files" on storage.objects
  for update
  using (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete own project files" on storage.objects
  for delete
  using (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
