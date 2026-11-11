-- [1149] 전국 정비구역 목록 — 국토교통부 "전국 도시정비사업 통합 데이터"(공공데이터포털 15160169 · 연 1회 공표 · 이용허락범위 제한 없음).
-- 좌표가 없는 자료다(시도 · 시군구 · 구역명칭 · 추진단계 · 사업유형 · 시행자 · 공급 예정 세대수). 서버(service_role)만 읽고 쓴다. 여러 번 돌려도 안전.
create table if not exists public.redev_national_zones (
  id text primary key,
  sido text not null,
  sigungu text not null,
  name text not null,
  stage text,
  project_type text,
  operator text,
  households integer,
  data_as_of text,
  fetched_at timestamptz not null default now()
);
create index if not exists redev_national_zones_region_idx on public.redev_national_zones (sido, sigungu);
alter table public.redev_national_zones enable row level security;
revoke all on public.redev_national_zones from anon, authenticated;
grant all on public.redev_national_zones to service_role;
