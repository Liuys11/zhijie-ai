create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  step_id uuid references public.learning_steps(id) on delete set null,
  title text not null,
  mode text not null default '随堂测评',
  score numeric(6,2),
  total_score numeric(6,2) not null default 100,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);

create table if not exists public.assessment_items (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_type text not null default 'single_choice' check (question_type in ('single_choice', 'true_false', 'short_answer')),
  question text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer text not null,
  explanation text,
  knowledge_title text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.assessment_answers (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  item_id uuid not null references public.assessment_items(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_answer text not null,
  is_correct boolean not null default false,
  score numeric(6,2) not null default 0,
  feedback text,
  created_at timestamptz not null default now(),
  unique(item_id, user_id)
);

create table if not exists public.learning_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  summary text not null,
  progress_snapshot jsonb not null default '{}'::jsonb,
  weak_points jsonb not null default '[]'::jsonb,
  advice text,
  created_at timestamptz not null default now()
);

create index if not exists assessments_project_id_idx on public.assessments(project_id, created_at desc);
create index if not exists assessment_items_assessment_id_idx on public.assessment_items(assessment_id, sort_order);
create index if not exists assessment_answers_assessment_id_idx on public.assessment_answers(assessment_id);
create index if not exists learning_reports_project_id_idx on public.learning_reports(project_id, created_at desc);

alter table public.assessments enable row level security;
alter table public.assessment_items enable row level security;
alter table public.assessment_answers enable row level security;
alter table public.learning_reports enable row level security;

drop policy if exists "users manage own assessments" on public.assessments;
drop policy if exists "users manage own assessment items" on public.assessment_items;
drop policy if exists "users manage own assessment answers" on public.assessment_answers;
drop policy if exists "users manage own learning reports" on public.learning_reports;

create policy "users manage own assessments" on public.assessments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own assessment items" on public.assessment_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own assessment answers" on public.assessment_answers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own learning reports" on public.learning_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
