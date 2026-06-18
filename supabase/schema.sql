create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text,
  project_type text not null default 'course' check (project_type in ('course', 'competition', 'research')),
  goal text,
  deadline date,
  weekly_minutes integer not null default 180,
  progress integer not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '新对话',
  mode text not null default 'explain',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  avatar_url text,
  avatar_path text,
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'ready', 'failed')),
  page_count integer,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.document_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  page_number integer,
  chunk_index integer not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  unique(document_id, chunk_index)
);

create table if not exists public.knowledge_nodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  mastery_score numeric(5,2) not null default 0 check (mastery_score between 0 and 100),
  confidence numeric(5,2) not null default 0 check (confidence between 0 and 100),
  evidence_count integer not null default 0,
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_edges (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_node_id uuid not null references public.knowledge_nodes(id) on delete cascade,
  target_node_id uuid not null references public.knowledge_nodes(id) on delete cascade,
  relation text not null default 'prerequisite',
  unique(source_node_id, target_node_id, relation)
);

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

create index if not exists projects_user_id_idx on public.projects(user_id);
create index if not exists conversations_project_id_idx on public.conversations(project_id);
create index if not exists messages_conversation_id_idx on public.messages(conversation_id, created_at);
create index if not exists documents_project_id_idx on public.documents(project_id);
create index if not exists learning_steps_project_id_idx on public.learning_steps(project_id, sort_order);
create index if not exists chunks_project_id_idx on public.document_chunks(project_id);
create index if not exists knowledge_nodes_project_id_idx on public.knowledge_nodes(project_id);
create index if not exists generated_assets_project_id_idx on public.generated_assets(project_id, created_at desc);
create index if not exists generated_assets_user_id_idx on public.generated_assets(user_id, created_at desc);

alter table public.projects enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.learning_steps enable row level security;
alter table public.document_chunks enable row level security;
alter table public.knowledge_nodes enable row level security;
alter table public.knowledge_edges enable row level security;
alter table public.generated_assets enable row level security;

create policy "users manage own projects" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own conversations" on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own messages" on public.messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own profile" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own documents" on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own learning steps" on public.learning_steps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own chunks" on public.document_chunks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own knowledge nodes" on public.knowledge_nodes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own knowledge edges" on public.knowledge_edges
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own generated assets" on public.generated_assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  target_project_id uuid,
  match_count integer default 8
)
returns table (
  id bigint,
  document_id uuid,
  content text,
  page_number integer,
  similarity float
)
language sql stable security invoker
as $$
  select
    dc.id,
    dc.document_id,
    dc.content,
    dc.page_number,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  where dc.project_id = target_project_id
    and dc.user_id = auth.uid()
    and dc.embedding is not null
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;
