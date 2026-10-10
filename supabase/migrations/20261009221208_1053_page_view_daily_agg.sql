-- [1053 · 방문 집계] 동의 없이도 남기는 익명 하루 집계 — 쿠키·식별자·IP·주소 전체를 저장하지 않는 "수"만.
-- 소유자 답(2026-10-10): "방문 집계·가입 단계·단지/지도 손질".
-- 왜: 1st-party 방문 기록(page_view_events)은 분석 동의 뒤에만 남아 운영 실측 표본이 방문의 약 7%였다 —
--     어느 화면이 몇 번 열렸는지, 어디서 들어왔는지(호스트만), 가입 단계마다 몇 명이 지나갔는지를 볼 수 없었다.
-- 무엇: (한국 날짜 · 화면 묶음 · 첫 화면 여부 · 들어온 호스트 · utm_source · 기기 종류) 마다 수 n 하나.
--     화면 묶음은 /complex/[id] 처럼 접은 이름(주소 원문 없음) · 들어온 곳은 호스트만(검색어가 실린 주소 금지) ·
--     기기 종류는 d(컴퓨터) · m(폰) · m:naver 같은 앱 안 브라우저 이름. 사람을 잇는 값이 없어 동의 대상이 아니다.
-- 쓰기는 app/api/metrics/pageview 의 서버 클라이언트(service_role)만 — 표는 RLS 켜고 정책 없음 · anon/authenticated 권한 회수.
-- 멱등: create … if not exists · create or replace.

create table if not exists public.page_view_daily_agg (
  day date not null,
  route text not null check (char_length(route) between 1 and 120),
  is_landing boolean not null default false,
  ref_host text not null default '' check (char_length(ref_host) <= 120),
  utm_source text not null default '' check (char_length(utm_source) <= 80),
  device text not null default '' check (char_length(device) <= 24),
  n integer not null default 0 check (n >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, route, is_landing, ref_host, utm_source, device)
);

create index if not exists page_view_daily_agg_route_day_idx
  on public.page_view_daily_agg (route, day desc);

alter table public.page_view_daily_agg enable row level security;
revoke all on table public.page_view_daily_agg from public, anon, authenticated;
grant select, insert, update on table public.page_view_daily_agg to service_role;

create or replace function public.bump_page_view_agg(
  p_day date,
  p_route text,
  p_landing boolean,
  p_ref_host text,
  p_utm_source text,
  p_device text
) returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.page_view_daily_agg as a (day, route, is_landing, ref_host, utm_source, device, n)
  values (
    p_day,
    left(p_route, 120),
    coalesce(p_landing, false),
    left(coalesce(p_ref_host, ''), 120),
    left(coalesce(p_utm_source, ''), 80),
    left(coalesce(p_device, ''), 24),
    1
  )
  on conflict (day, route, is_landing, ref_host, utm_source, device)
  do update set n = a.n + 1, updated_at = now();
$$;

revoke all on function public.bump_page_view_agg(date, text, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.bump_page_view_agg(date, text, boolean, text, text, text) to service_role;