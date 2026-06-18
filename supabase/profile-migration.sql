create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

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
