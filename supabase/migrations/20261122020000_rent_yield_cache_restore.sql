-- [1210] 새 DB(2026-11-10)에 전월세 수익률 캐시가 없었다 — ops.rent_yield_cache · ops.refresh_rent_yield_cache · 매일 크론이 옮겨지지 않아
-- region_rent_yield_summary 가 매 호출 전국 전월세(수십만 행) 중앙값을 그 자리에서 셌다 → 57014 statement timeout(운영 로그 · /signup 등 단지 화면 경로).
-- lib/market/rent-yield.ts 머리 주석의 설계(캐시 표 + 매일 19:50 UTC 새로 고침 + 함수는 캐시 우선)를 되살린다.

create table if not exists ops.rent_yield_cache (
  region_name text primary key,
  months int not null,
  jeonse_count bigint not null default 0,
  jeonse_median_deposit_krw numeric,
  wolse_count bigint not null default 0,
  wolse_median_deposit_krw numeric,
  wolse_median_monthly_krw numeric,
  computed_at timestamptz not null default now()
);
revoke all on ops.rent_yield_cache from public, anon, authenticated;

create or replace function ops.refresh_rent_yield_cache(p_months int default 3)
returns int
language plpgsql
security definer
set search_path = public, ops
as $$
declare n int;
begin
  set local statement_timeout = '180s';
  delete from ops.rent_yield_cache;
  insert into ops.rent_yield_cache (region_name, months, jeonse_count, jeonse_median_deposit_krw, wolse_count, wolse_median_deposit_krw, wolse_median_monthly_krw, computed_at)
  select t.region_name, greatest(1, p_months),
    count(*) filter (where coalesce(t.monthly_rent_krw,0) = 0),
    percentile_cont(0.5) within group (order by t.deposit_krw) filter (where coalesce(t.monthly_rent_krw,0) = 0),
    count(*) filter (where coalesce(t.monthly_rent_krw,0) > 0),
    percentile_cont(0.5) within group (order by t.deposit_krw) filter (where coalesce(t.monthly_rent_krw,0) > 0),
    percentile_cont(0.5) within group (order by t.monthly_rent_krw) filter (where coalesce(t.monthly_rent_krw,0) > 0),
    now()
  from public.market_transactions t
  where t.transaction_type = 'rent' and t.property_type = 'apartment' and t.is_cancelled = false
    and t.deposit_krw is not null and t.deposit_krw > 0
    and t.contract_ym >= to_char(now() - make_interval(months => greatest(1, p_months) - 1), 'YYYYMM')
  group by t.region_name;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function ops.refresh_rent_yield_cache(int) from public, anon, authenticated;

-- 캐시 우선: 같은 개월 수의 캐시가 있으면 그것을, 없으면(첫 채움 전 · 다른 개월 수) 예전 라이브 집계
create or replace function public.region_rent_yield_summary(p_months integer default 3)
returns table(region_name text, jeonse_count bigint, jeonse_median_deposit_krw numeric, wolse_count bigint, wolse_median_deposit_krw numeric, wolse_median_monthly_krw numeric)
language plpgsql
stable
security definer
set search_path = public, ops
as $$
begin
  if exists (select 1 from ops.rent_yield_cache c where c.months = greatest(1, p_months)) then
    return query
      select c.region_name, c.jeonse_count, c.jeonse_median_deposit_krw, c.wolse_count, c.wolse_median_deposit_krw, c.wolse_median_monthly_krw
      from ops.rent_yield_cache c where c.months = greatest(1, p_months);
    return;
  end if;
  return query
    select t.region_name,
      count(*) filter (where coalesce(t.monthly_rent_krw,0) = 0),
      percentile_cont(0.5) within group (order by t.deposit_krw) filter (where coalesce(t.monthly_rent_krw,0) = 0)::numeric,
      count(*) filter (where coalesce(t.monthly_rent_krw,0) > 0),
      percentile_cont(0.5) within group (order by t.deposit_krw) filter (where coalesce(t.monthly_rent_krw,0) > 0)::numeric,
      percentile_cont(0.5) within group (order by t.monthly_rent_krw) filter (where coalesce(t.monthly_rent_krw,0) > 0)::numeric
    from public.market_transactions t
    where t.transaction_type = 'rent' and t.property_type = 'apartment' and t.is_cancelled = false
      and t.deposit_krw is not null and t.deposit_krw > 0
      and t.contract_ym >= to_char(now() - make_interval(months => greatest(1, p_months) - 1), 'YYYYMM')
    group by t.region_name;
end $$;

-- 매일 19:50 UTC(다음날 04:50 KST) — 머리 주석의 옛 일정 그대로
select cron.unschedule('rent-yield-cache-refresh') where exists (select 1 from cron.job where jobname = 'rent-yield-cache-refresh');
select cron.schedule('rent-yield-cache-refresh', '50 19 * * *', $c$select ops.refresh_rent_yield_cache(3)$c$);
