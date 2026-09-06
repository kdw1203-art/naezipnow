-- [967 · 12] 공개 임장노트 댓글 표.
--
-- 왜 새 표인가: 커뮤니티 글(posts)은 댓글을 comments jsonb 한 칸에 넣어 두는데,
-- 임장노트(inspection_notes)는 jsonb 컬럼이 metadata·ai_analysis 처럼 이미
-- "노트 본문의 일부" 로 쓰이고 있어 댓글을 거기 섞으면 노트 PATCH(전체 metadata
-- 병합)와 충돌한다. 행 단위 표가 soft-delete·신고·알림 착지(#comments) 모두에
-- 단순하다.
--
-- note_id 는 uuid — inspection_notes.id 가 uuid 다(lib/inspection/store-db.ts 의
-- UUID_RE 가드와 같은 전제). 노트가 지워지면 댓글도 함께 지운다(cascade) —
-- 삭제 버튼(967 · 3)이 노트를 지운 뒤 고아 댓글이 남지 않게.
--
-- 접근: service_role 전용. RLS 켜고 정책은 만들지 않는다 — 읽기·쓰기 모두
-- app/api/inspection/notes/[id]/comments 라우트가 세션·공개 여부를 판정한 뒤
-- getServiceSupabase() 로만 닿는다. anon/authenticated GRANT 도 주지 않는다
-- (author_email 이 그대로 든 표라 PostgREST 직접 조회 경로를 처음부터 닫는다 —
-- inspection_notes.author_email 이 컬럼 GRANT 로 새어 나갔던 20260806 의 교훈).
--
-- 멱등: create table if not exists / create index if not exists.

create table if not exists public.note_comments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.inspection_notes(id) on delete cascade,
  author_email text not null,
  author_label text not null,
  body text not null check (char_length(body) between 1 and 1000),
  parent_id uuid null references public.note_comments(id) on delete cascade,
  deleted_at timestamptz null,
  created_at timestamptz not null default now()
);

comment on table public.note_comments is
  '[967 · 12] 공개 임장노트 댓글 — service_role 전용(RLS on · 정책 없음). soft-delete 는 deleted_at.';

create index if not exists note_comments_note_created_idx
  on public.note_comments (note_id, created_at);

alter table public.note_comments enable row level security;
