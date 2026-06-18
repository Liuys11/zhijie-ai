create table if not exists public.generated_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  asset_type text not null check (asset_type in ('image', 'video', 'audio', 'file')),
  prompt text not null,
  storage_bucket text not null,
  storage_path text not null,
  public_url text,
  mime_type text,
  provider text,
  model text,
  status text not null default 'completed' check (status in ('queued', 'generating', 'completed', 'failed')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generated_assets_project_id_idx
  on public.generated_assets(project_id, created_at desc);

create index if not exists generated_assets_user_id_idx
  on public.generated_assets(user_id, created_at desc);

alter table public.generated_assets enable row level security;

drop policy if exists "users manage own generated assets" on public.generated_assets;

create policy "users manage own generated assets" on public.generated_assets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'generated-images',
  'generated-images',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read generated images" on storage.objects;
drop policy if exists "users insert own generated images" on storage.objects;
drop policy if exists "users update own generated images" on storage.objects;
drop policy if exists "users delete own generated images" on storage.objects;

create policy "public read generated images" on storage.objects
  for select
  using (bucket_id = 'generated-images');

create policy "users insert own generated images" on storage.objects
  for insert
  with check (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users update own generated images" on storage.objects
  for update
  using (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete own generated images" on storage.objects
  for delete
  using (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
