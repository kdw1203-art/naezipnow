-- [1030 · 3차 · 43] 홈·분석·자료 출처·여정의 커버리지 수치(아파트 실거래 N건 · 단지 N곳 · 시군구 N곳)를 하루 한 번 미리 센다.
-- 지금은 요청 때 전수 count(pg_stat_statements 8/4~10/4: 평균 6.7초 + trade_complex_total 1.1초)라 매일 수집 뒤 첫 렌더가 그만큼 기다렸다.
-- 앱(lib/newui/home-coverage.ts)은 이 표가 48시간 안이면 읽고, 없으면 예전처럼 직접 센다. 롤백: cron.unschedule 뒤 표·함수 제거.
create table if not exists public.coverage_totals (
  id smallint primary key default 1 check (id = 1),
  tx_count bigint not null,
  complex_count bigint not null,
  region_count integer not null,
  refreshed_at timestamptz not null default now()
);
alter table public.coverage_totals enable row level security;
-- 정책 없음: 서비스 롤(앱 서버)만 읽는다. anon·authenticated 는 0행.
create or replace function public.refresh_coverage_totals()
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  insert into public.coverage_totals (id, tx_count, complex_count, region_count, refreshed_at)
  select 1,
         (select count(*) from public.market_transactions where property_type = 'apartment' and is_cancelled = false),
         public.trade_complex_total(),
         (select count(*) from public.market_region_names()),
         now()
  on conflict (id) do update
    set tx_count = excluded.tx_count,
        complex_count = excluded.complex_count,
        region_count = excluded.region_count,
        refreshed_at = excluded.refreshed_at
  returning jsonb_build_object('tx', tx_count, 'complex', complex_count, 'region', region_count, 'at', refreshed_at);
$$;
revoke all on function public.refresh_coverage_totals() from public, anon, authenticated;
-- 매일 19:20 UTC(04:20 KST) — market-aggregates-daily(19:00) 뒤. 첫 값은 적용 직후 한 번 직접 실행한다.
select cron.schedule('coverage-totals-daily', '20 19 * * *', $cron$SET statement_timeout = '120s'; SELECT public.refresh_coverage_totals();$cron$);