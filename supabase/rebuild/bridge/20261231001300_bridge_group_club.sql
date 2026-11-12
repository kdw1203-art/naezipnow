-- [1168] 임장 모임 — 일정 · 참석 · 게시판 · 투표
-- 모임(meetings) 하나에 여러 일정, 게시판 글(공지·자유·일정 후기·가입 인사), 투표를 붙인다.
-- 서버(서비스 키)만 읽고 쓴다: RLS 를 켜고 정책은 두지 않는다.

create table if not exists public.group_schedules (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  author_email text not null,
  author_label text,
  title text not null,
  scheduled_at timestamptz not null,
  place text,
  complex_id text,
  max_members integer not null default 4 check (max_members between 2 and 50),
  mode text,
  cost_total integer check (cost_total is null or cost_total between 0 and 10000000),
  status text not null default 'open',
  created_at timestamptz not null default now()
);
create index if not exists group_schedules_meeting_idx
  on public.group_schedules (meeting_id, scheduled_at);

create table if not exists public.group_schedule_attendees (
  schedule_id uuid not null references public.group_schedules(id) on delete cascade,
  user_email text not null,
  user_label text,
  created_at timestamptz not null default now(),
  primary key (schedule_id, user_email)
);

create table if not exists public.group_posts (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  author_email text not null,
  author_label text,
  board text not null check (board in ('notice', 'free', 'review', 'hello')),
  body text not null,
  schedule_id uuid references public.group_schedules(id) on delete set null,
  note_id uuid,
  parent_id uuid references public.group_posts(id) on delete cascade,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists group_posts_meeting_idx
  on public.group_posts (meeting_id, created_at desc);

create table if not exists public.group_polls (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  author_email text not null,
  author_label text,
  title text not null,
  kind text not null default 'text' check (kind in ('text', 'date')),
  options jsonb not null default '[]'::jsonb,
  multiple boolean not null default false,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists group_polls_meeting_idx
  on public.group_polls (meeting_id, created_at desc);

create table if not exists public.group_poll_votes (
  poll_id uuid not null references public.group_polls(id) on delete cascade,
  user_email text not null,
  option_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (poll_id, user_email)
);

alter table public.group_schedules enable row level security;
alter table public.group_schedule_attendees enable row level security;
alter table public.group_posts enable row level security;
alter table public.group_polls enable row level security;
alter table public.group_poll_votes enable row level security;

notify pgrst, 'reload schema';
