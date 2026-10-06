-- [1043] 공개 임장노트 독자 평가(별점 1~5) — 한 사람이 한 노트에 한 번, 다시 누르면 바뀐다.
-- 소유자 지시(2026-10-06): "임장노트에 사용자가 별점이나 점수를 매겨서 평가를 하고 댓글도 달고 사용자가 참여하는 임장노트".
-- note_comments 와 같은 태도: RLS 켜고 정책 없음 = 서버(service_role)만 읽고 쓴다. 평균·인원은 서버가 계산해 내려보내고
-- 누가 몇 점을 줬는지는 화면에 나가지 않는다(rater_email 은 "내 평가" 판정과 한 사람 한 번 제약에만 쓴다).
create table if not exists public.note_ratings (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.inspection_notes(id) on delete cascade,
  rater_email text not null,
  stars smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint note_ratings_stars_check check (stars between 1 and 5),
  constraint note_ratings_rater_email_check check (rater_email = lower(btrim(rater_email)) and char_length(rater_email) between 3 and 320),
  constraint note_ratings_note_rater_key unique (note_id, rater_email)
);

alter table public.note_ratings enable row level security;

revoke all on table public.note_ratings from public, anon, authenticated;
grant select, insert, update, delete on table public.note_ratings to service_role;

comment on table public.note_ratings is '공개 임장노트 독자 평가(별점 1~5) · 한 사람 한 노트 한 번 · 서버(service_role) 전용 — 1043';