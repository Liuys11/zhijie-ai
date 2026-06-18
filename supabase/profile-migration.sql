create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  avatar_url text,
  avatar_path text,
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists avatar_path text;

alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'users manage own profile'
  ) then
    create policy "users manage own profile" on public.profiles
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'users read avatar objects'
  ) then
    create policy "users read avatar objects" on storage.objects
      for select using (bucket_id = 'avatars');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'users insert own avatar objects'
  ) then
    create policy "users insert own avatar objects" on storage.objects
      for insert with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'users update own avatar objects'
  ) then
    create policy "users update own avatar objects" on storage.objects
      for update using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      ) with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'users delete own avatar objects'
  ) then
    create policy "users delete own avatar objects" on storage.objects
      for delete using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
