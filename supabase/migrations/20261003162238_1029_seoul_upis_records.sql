-- [1029] 서울 열린데이터광장 도시계획정보체계(UPIS) 결정 조서 — 정비사업(upisRebuild) · 도시개발(upisUrbanDev) ·
-- 지구단위계획(upisDistUnitPlan) 과 결정고시(upisAnnouncement). 크론(/api/cron/redevelopment-ingest)이 매일 service_role 로
-- 적재하고, 화면(/redevelopment · /redevelopment/[id] · /region/[id])은 anon 으로 읽는다. 개인정보 없음 — 서울시가 공개한
-- 조서(위치명·지역명·면적·결정고시 코드)뿐이다. 쓰기 정책은 두지 않는다(RLS 켜짐 → service_role 만 쓴다).
-- 적용 메모: MCP apply_migration 이 네 번 시간 초과(DB 는 한가했다 · 2026-10-03)여서 같은 본문을 execute_sql 로 실행하고
-- 원장(supabase_migrations.schema_migrations)에 같은 본문을 한 문장으로 직접 적었다 — 이 파일과 원장 본문은 글자 단위로 같다.
-- 롤백: drop view public.seoul_upis_gu_summary; drop table public.seoul_upis_sync, public.seoul_upis_announcements, public.seoul_upis_records;
create table if not exists public.seoul_upis_records (
  rpt_mng_cd text primary key,
  service text not null,
  prjc_cd text,
  rpt_type text,
  lclsf text,
  mclsf text,
  sclsf text,
  pstn_nm text,
  rgn_nm text,
  area_exs numeric,
  area_chg_aftr numeric,
  dcsn_ancmnt_mng_cd text,
  sigungu text,
  emd text,
  code_date date,
  raw jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);
create index if not exists seoul_upis_records_service_sigungu_idx on public.seoul_upis_records (service, sigungu);
create index if not exists seoul_upis_records_code_date_idx on public.seoul_upis_records (code_date desc);
create index if not exists seoul_upis_records_ancmnt_idx on public.seoul_upis_records (dcsn_ancmnt_mng_cd);
alter table public.seoul_upis_records enable row level security;
revoke all on table public.seoul_upis_records from public, anon, authenticated;
grant select on public.seoul_upis_records to anon, authenticated;
drop policy if exists seoul_upis_records_public_read on public.seoul_upis_records;
create policy seoul_upis_records_public_read on public.seoul_upis_records for select to anon, authenticated using (true);
comment on table public.seoul_upis_records is '[1029] 서울 UPIS 결정 조서(정비사업·도시개발·지구단위계획) — 열린데이터광장 원문 그대로. 크론이 service_role 로 적재, 공개 읽기.';
create table if not exists public.seoul_upis_announcements (
  ancmnt_mng_cd text primary key,
  prjc_cd text,
  ancmnt_type text,
  ancmnt_no text,
  ancmnt_ymd date,
  ancmnt_inst text,
  tkcg_inst text,
  ttl text,
  cn text,
  raw jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);
create index if not exists seoul_upis_announcements_ymd_idx on public.seoul_upis_announcements (ancmnt_ymd desc);
alter table public.seoul_upis_announcements enable row level security;
revoke all on table public.seoul_upis_announcements from public, anon, authenticated;
grant select on public.seoul_upis_announcements to anon, authenticated;
drop policy if exists seoul_upis_announcements_public_read on public.seoul_upis_announcements;
create policy seoul_upis_announcements_public_read on public.seoul_upis_announcements for select to anon, authenticated using (true);
comment on table public.seoul_upis_announcements is '[1029] 서울 UPIS 결정고시(upisAnnouncement) — 고시번호·고시일자·제목. 조서의 dcsn_ancmnt_mng_cd 와 잇는다.';
create table if not exists public.seoul_upis_sync (
  service text primary key,
  next_start integer not null default 1,
  total_count integer,
  rows_total integer not null default 0,
  last_run_at timestamptz,
  last_full_at timestamptz,
  last_error text
);
alter table public.seoul_upis_sync enable row level security;
revoke all on table public.seoul_upis_sync from public, anon, authenticated;
comment on table public.seoul_upis_sync is '[1029] UPIS 적재 진행 상태(서비스별 다음 시작 번호) — service_role 전용.';
create or replace view public.seoul_upis_gu_summary with (security_invoker = on) as
  select service, sigungu, count(*)::integer as n, max(code_date) as latest
  from public.seoul_upis_records
  group by service, sigungu;
grant select on public.seoul_upis_gu_summary to anon, authenticated;
comment on view public.seoul_upis_gu_summary is '[1029] 서비스·자치구별 조서 건수 — /redevelopment 칩과 /region/[id] 머리칸. security_invoker 라 공개 읽기 정책을 그대로 탄다.';