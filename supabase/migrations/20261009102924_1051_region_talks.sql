-- [1051 · 홈 실시간 토론] 지역(시·군·구) + 단지 한 줄 토론.
-- 소유자 지시(2026-10-09): "홈 하단에 이런 실시간 토론을 할 수 있는 창" (네이버 증권 '오늘의 종목 토론' 화면) ·
-- 답: 단위 = 지역 + 단지 · 사람 글이 없으면 자동 소식 섞기 · 홈 창에서 바로 한 줄.
--
-- 1) region_talks: 한 줄(2~200자) 글. 지역 id 는 lib/region/catalog 의 id(gangnam · seongnam-bundang …),
--    단지는 선택(complex_id = 단지 화면 주소의 id). 지우기는 deleted_at(작성자·관리자), 신고 3건이면 hidden_at.
--    author_email 이 든 표라 service_role 전용(RLS 켜고 정책 없음 · anon/authenticated 권한 회수) —
--    읽기·쓰기는 app/api/talk/** 라우트가 세션을 판정한 뒤 서버 클라이언트로만 닿는다(note_comments 와 같은 방식).
--    회원 탈퇴 시 파기 대상(docs/ops/privacy-requests.md).
-- 2) region_talk_reports: 신고 한 사람당 한 번(talk_id + reporter_email 기본 키).
-- 3) report_region_talk: 신고 기록 + 누적 수 갱신 + 임계 도달 시 숨김을 한 번에(동시 신고에도 한 번만 센다).
-- 멱등: create … if not exists · create or replace.

create table if not exists public.region_talks (
  id uuid primary key default gen_random_uuid(),
  region_id text not null check (char_length(region_id) between 1 and 64),
  region_name text not null check (char_length(region_name) between 1 and 40),
  complex_id text null check (complex_id is null or char_length(complex_id) between 1 and 200),
  complex_name text null check (complex_name is null or char_length(complex_name) between 1 and 80),
  author_email text not null,
  author_label text not null check (char_length(author_label) between 1 and 40),
  body text not null check (char_length(body) between 2 and 200),
  report_count integer not null default 0,
  hidden_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists region_talks_region_created_idx
  on public.region_talks (region_id, created_at desc);
create index if not exists region_talks_created_idx
  on public.region_talks (created_at desc);
create index if not exists region_talks_author_created_idx
  on public.region_talks (author_email, created_at desc);

alter table public.region_talks enable row level security;
revoke all on table public.region_talks from public, anon, authenticated;
grant select, insert, update, delete on table public.region_talks to service_role;

comment on table public.region_talks is
  '[1051] 홈·토론 화면의 지역(+단지) 한 줄 토론 — service_role 전용(RLS on · 정책 없음). 지우기 deleted_at · 신고 3건 hidden_at. 회원 탈퇴 시 파기 대상.';

create table if not exists public.region_talk_reports (
  talk_id uuid not null references public.region_talks(id) on delete cascade,
  reporter_email text not null,
  reason text not null default '' check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (talk_id, reporter_email)
);

alter table public.region_talk_reports enable row level security;
revoke all on table public.region_talk_reports from public, anon, authenticated;
grant select, insert, update, delete on table public.region_talk_reports to service_role;

comment on table public.region_talk_reports is
  '[1051] 지역 토론 신고 — 한 사람당 한 번. service_role 전용.';

create or replace function public.report_region_talk(
  p_talk_id uuid,
  p_reporter text,
  p_reason text,
  p_threshold integer default 3
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_reporter text := lower(trim(coalesce(p_reporter, '')));
  v_inserted integer := 0;
  v_count integer;
begin
  if v_reporter = '' or position('@' in v_reporter) = 0 then
    return 'bad_reporter';
  end if;
  if not exists (select 1 from public.region_talks t where t.id = p_talk_id and t.deleted_at is null) then
    return 'missing';
  end if;
  insert into public.region_talk_reports (talk_id, reporter_email, reason)
  values (p_talk_id, v_reporter, left(coalesce(p_reason, ''), 200))
  on conflict (talk_id, reporter_email) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return 'already';
  end if;
  update public.region_talks t
     set report_count = (select count(*) from public.region_talk_reports r where r.talk_id = p_talk_id)
   where t.id = p_talk_id
  returning t.report_count into v_count;
  if v_count >= greatest(coalesce(p_threshold, 3), 1) then
    update public.region_talks t set hidden_at = coalesce(t.hidden_at, now()) where t.id = p_talk_id;
    return 'hidden';
  end if;
  return 'reported';
end;
$fn$;

revoke all on function public.report_region_talk(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.report_region_talk(uuid, text, text, integer) to service_role;