-- [994 · D4] 청약 공고·경쟁률 저장소 (2026-09-13)
--
-- 왜: 청약 화면(/apply·/apply/calendar)은 청약홈 odcloud 를 요청 때마다 라이브로 불렀다
-- (1시간 캐시). 저장이 없으니 (1) 신선도 감시·"기준일" 표시가 불가능했고, (2) 관심 지역
-- 새 공고·접수 시작·당첨 발표 알림을 만들 수 없었으며, (3) odcloud 장애면 화면이 통째로
-- 비었다. supply-ingest 크론이 매일 같은 상세 API 를 25페이지 읽고 있으므로, 그 행을 여기
-- 함께 적재하면 추가 호출 없이 "매일 사실"이 된다. 경쟁률은 같은 크론이 최신 3페이지를 더 읽는다.
--
-- 권한: 서비스 롤 전용(deny-all RLS · revoke). 화면은 서버에서 읽는다. GRANT 없음(정책).

create table if not exists public.applyhome_announcements (
  house_manage_no  text not null,
  pblanc_no        text not null,
  house_nm         text not null,
  house_secd_nm    text,
  region           text,                -- SUBSCRPT_AREA_CODE_NM (서울·경기 …)
  address          text,
  tot_supply       integer,
  rcept_bgnde      date,
  rcept_endde      date,
  rcrit_pblanc_de  date,                -- 모집공고일
  przwner_de       date,                -- 당첨자 발표일
  mvn_ym           text,                -- 입주예정월 yyyymm
  pblanc_url       text,
  builder          text,
  first_seen_at    timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (house_manage_no, pblanc_no)
);
create index if not exists applyhome_announcements_rcept_bgnde_idx on public.applyhome_announcements (rcept_bgnde);
create index if not exists applyhome_announcements_przwner_idx    on public.applyhome_announcements (przwner_de);
create index if not exists applyhome_announcements_first_seen_idx on public.applyhome_announcements (first_seen_at desc);
create index if not exists applyhome_announcements_region_idx     on public.applyhome_announcements (region);

alter table public.applyhome_announcements enable row level security;
revoke all on public.applyhome_announcements from public, anon, authenticated;

create table if not exists public.applyhome_competition (
  house_manage_no  text not null,
  pblanc_no        text not null,
  house_ty         text not null,       -- 주택형 (084.9700 …)
  rank_code        integer not null default 0,
  reside_secd      text not null default '',
  reside_senm      text,
  supply_count     integer,
  req_cnt          integer,
  cmpet_rate       text,                -- 원문(예: "12.5", "(△3)" 미달 표기) 그대로 보존
  cmpet_rate_num   numeric,             -- 숫자로 읽힌 경우만
  updated_at       timestamptz not null default now(),
  primary key (house_manage_no, pblanc_no, house_ty, rank_code, reside_secd)
);
create index if not exists applyhome_competition_updated_idx on public.applyhome_competition (updated_at desc);

alter table public.applyhome_competition enable row level security;
revoke all on public.applyhome_competition from public, anon, authenticated;

comment on table public.applyhome_announcements is '[994] 청약홈 APT 분양공고(상세 API) 일일 적재 — 캘린더·알림·기준일의 단일 출처';
comment on table public.applyhome_competition is '[994] 청약홈 APT 경쟁률 일일 적재(최신순 상위 페이지)';
