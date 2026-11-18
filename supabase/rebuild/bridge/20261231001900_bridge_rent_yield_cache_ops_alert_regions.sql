-- [1195] 새 DB 이전 때 빠진 것 셋.
-- ① 전월세 집계 캐시(ops.rent_yield_cache + 매일 19:50 UTC pg_cron) — 없어서 region_rent_yield_summary 가 부를 때마다 실거래 표를 훑었다
--    (운영 실측: 593회 · 평균 1.8초 · statement timeout 18건 — /signup · /notes · /apply 화면까지).
-- ② public.report_ops_alert — 앱이 SMTP 인증 실패 · 가입 5xx · KV 장애를 운영 경보에 남기는 통로(service_role 만).
-- ③ legal_regions — 관심 지역 검색에 35곳만 켜져 있던 것(지방 20만 이상 도시 포함 · 같은 이름 중복은 실거래가 있는 코드만).

-- ① 전월세 집계 캐시 ---------------------------------------------------------
create table if not exists ops.rent_yield_cache (
  p_months int primary key,
  rows jsonb not null,
  refreshed_at timestamptz not null default now()
);

create or replace function public.region_rent_yield_summary_live(p_months integer default 3)
 returns table(region_name text, jeonse_count bigint, jeonse_median_deposit_krw numeric, wolse_count bigint, wolse_median_deposit_krw numeric, wolse_median_monthly_krw numeric)
 language sql stable set search_path to 'public'
as $f$
  select
    t.region_name,
    count(*) filter (where coalesce(t.monthly_rent_krw,0) = 0),
    percentile_cont(0.5) within group (order by t.deposit_krw) filter (where coalesce(t.monthly_rent_krw,0) = 0),
    count(*) filter (where coalesce(t.monthly_rent_krw,0) > 0),
    percentile_cont(0.5) within group (order by t.deposit_krw) filter (where coalesce(t.monthly_rent_krw,0) > 0),
    percentile_cont(0.5) within group (order by t.monthly_rent_krw) filter (where coalesce(t.monthly_rent_krw,0) > 0)
  from public.market_transactions t
  where t.transaction_type = 'rent'
    and t.property_type = 'apartment'
    and coalesce(t.is_cancelled, false) = false
    and t.deposit_krw is not null and t.deposit_krw > 0
    and t.contract_ym >= to_char(now() - make_interval(months => greatest(1, p_months) - 1), 'YYYYMM')
  group by t.region_name
$f$;

create or replace function ops.refresh_rent_yield_cache()
 returns integer language plpgsql security definer
 set search_path to 'public', 'ops' set statement_timeout to '120s'
as $f$
declare n int;
begin
  insert into ops.rent_yield_cache(p_months, rows, refreshed_at)
  select 3, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb), now() from public.region_rent_yield_summary_live(3) x
  on conflict (p_months) do update set rows = excluded.rows, refreshed_at = excluded.refreshed_at;
  select jsonb_array_length(rows) into n from ops.rent_yield_cache where p_months = 3;
  return n;
end $f$;

create or replace function public.region_rent_yield_summary(p_months integer default 3)
 returns table(region_name text, jeonse_count bigint, jeonse_median_deposit_krw numeric, wolse_count bigint, wolse_median_deposit_krw numeric, wolse_median_monthly_krw numeric)
 language plpgsql stable security definer set search_path to 'public', 'ops'
as $f$
#variable_conflict use_column
begin
  if exists (select 1 from ops.rent_yield_cache c where c.p_months = greatest(1, p_months) and c.refreshed_at > now() - interval '72 hours') then
    return query
      select r.region_name, r.jeonse_count, r.jeonse_median_deposit_krw, r.wolse_count, r.wolse_median_deposit_krw, r.wolse_median_monthly_krw
        from ops.rent_yield_cache c,
             jsonb_to_recordset(c.rows) as r(region_name text, jeonse_count bigint, jeonse_median_deposit_krw numeric, wolse_count bigint, wolse_median_deposit_krw numeric, wolse_median_monthly_krw numeric)
       where c.p_months = greatest(1, p_months);
    return;
  end if;
  return query select * from public.region_rent_yield_summary_live(p_months);
end $f$;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'rent-yield-cache-refresh') then perform cron.unschedule('rent-yield-cache-refresh'); end if;
  perform cron.schedule('rent-yield-cache-refresh', '50 19 * * *', 'select ops.refresh_rent_yield_cache()');
end $$;

select ops.refresh_rent_yield_cache() as rent_yield_regions;

-- ② 운영 경보 통로 --------------------------------------------------------------
create or replace function public.report_ops_alert(p_check text, p_severity text, p_detail text, p_throttle_hours integer default 6)
 returns boolean language plpgsql security definer set search_path to 'ops', 'public'
as $f$
declare last_sev text;
begin
  if p_severity not in ('critical', 'warn', 'ok') or p_check !~ '^ops\.[a-z0-9_:.-]+$' then return false; end if;
  select l.severity into last_sev from ops.health_alert_log l where l.check_name = p_check order by l.checked_at desc limit 1;
  if p_severity = 'ok' then
    if last_sev is null or last_sev = 'ok' then return false; end if;
  elsif exists (select 1 from ops.health_alert_log l where l.check_name = p_check and l.severity = p_severity
                 and l.checked_at > now() - make_interval(hours => greatest(1, p_throttle_hours))) then
    return false;
  end if;
  insert into ops.health_alert_log(check_name, severity, detail, age_hours) values (p_check, p_severity, left(p_detail, 500), 0);
  return true;
end $f$;
revoke all on function public.report_ops_alert(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.report_ops_alert(text, text, text, integer) to service_role;

-- ③ 관심 지역 표 --------------------------------------------------------------------
-- 실거래 원표(market_transactions)를 세면 SQL Editor 시간 제한에 걸린다(2026-11-18 실측) — 월별 집계표(market_region_monthly)로 센다.
with t as (
  select region_code, sum(transaction_count) n from public.market_region_monthly where month::text >= '202507' group by 1)
update public.legal_regions r
   set enabled = (
         r.lawd_cd not in ('41110','41130','41170','41190','41270','41280','41460','43110','44130','47110','48120','52110','41590',
                           '28110','28140','28260')
         and not (coalesce((select n from t where t.region_code = r.lawd_cd), 0) = 0
                  and exists (select 1 from public.legal_regions r2 join t t2 on t2.region_code = r2.lawd_cd
                               where r2.display_name = r.display_name and r2.lawd_cd <> r.lawd_cd and t2.n > 0))),
       updated_at = now();

with t as (
  select region_code, sum(transaction_count) n from public.market_region_monthly
   where month::text >= to_char((now() at time zone 'Asia/Seoul') - interval '6 month','YYYYMM') group by 1),
y as (
  select r.lawd_cd, r.sido in ('서울','경기','인천') cap,
         row_number() over (partition by r.sido in ('서울','경기','인천') order by t.n desc) rk
    from public.legal_regions r join t on t.region_code = r.lawd_cd
   where r.enabled and t.n > 0)
update public.legal_regions r
   set priority = coalesce((select case when y.cap then 1000 - y.rk * 2 else 1000 - y.rk * 4 - 1 end from y where y.lawd_cd = r.lawd_cd), 0);

select (select count(*) from public.legal_regions where enabled) as regions_enabled,
       (select count(*) from cron.job where jobname = 'rent-yield-cache-refresh') as rent_job;
