-- [새 프로젝트 보충 3] 집계가 다 선 뒤 — 지도 분포 · 단지 수 · 단지 월별 추이 · 가입 유입 뷰(코드 호출 모양에 맞춰 다시 지음 · 추정)
create or replace function public.trade_complex_total() returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select count(*) from public.complex_tx_stats_base $$;
create or replace function public.get_complex_monthly_trend(p_complex_id text, p_limit integer default 24)
returns table (yyyymm text, avg_manwon bigint, min_manwon bigint, max_manwon bigint, deal_count bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.contract_ym, round(avg(t.deal_amount_krw) / 10000)::bigint, (min(t.deal_amount_krw) / 10000)::bigint, (max(t.deal_amount_krw) / 10000)::bigint, count(*)
  from public.market_transactions t
  where t.transaction_type = 'sale' and t.is_cancelled = false and t.deal_amount_krw > 0
    and public.complex_id(t.region_name, t.complex_name) = p_complex_id
  group by t.contract_ym order by t.contract_ym desc limit greatest(1, least(coalesce(p_limit, 24), 120)) $$;
revoke all on function public.trade_complex_total(), public.get_complex_monthly_trend(text, integer) from public, anon, authenticated;
grant execute on function public.trade_complex_total(), public.get_complex_monthly_trend(text, integer) to service_role;
do $$ begin
  if to_regclass('public.admin_acquisition_signups') is null then
    execute $v$ create view public.admin_acquisition_signups with (security_invoker = on) as
      select (u.created_at at time zone 'Asia/Seoul')::date as day, coalesce(nullif(u.signup_source, ''), 'direct') as utm_source, ''::text as utm_medium,
             coalesce(u.signup_campaign, '') as utm_campaign, ''::text as referrer, count(*)::bigint as signups
      from public.app_users u group by 1, 2, 4 $v$;
  end if;
end $$;

-- 집계 갱신 본체(운영 원문이 저장소에 없다 — 2026-08-01 판의 순서를 따라 다시 지음). 래퍼 refresh_market_aggregates() 가 부른다.
create or replace function private.refresh_mv(p_rel regclass) returns void language plpgsql security definer set search_path = market_agg, public, pg_temp as $$
declare populated boolean; begin
  select relispopulated into populated from pg_class where oid = p_rel;
  if coalesce(populated, false) then
    begin execute format('refresh materialized view concurrently %s', p_rel);
    exception when others then execute format('refresh materialized view %s', p_rel); end;
  else execute format('refresh materialized view %s', p_rel);
  end if;
end $$;
create or replace function public.refresh_market_aggregates_impl() returns jsonb language plpgsql security definer
set search_path = market_agg, public, pg_temp set statement_timeout to '280s' as $$
declare t0 timestamptz := clock_timestamp(); r text; steps jsonb := '{}'::jsonb; t1 timestamptz;
begin
  foreach r in array array['market_agg.tx_band_landing_mv','market_agg.tx_band_complex_mv','market_agg.map_price_point_mv','market_agg.complex_sitemap_mv',
                           'market_agg.complex_pair_mv','public.complex_tx_stats_base','market_agg.complex_household_v2','market_agg.complex_household_byname_v2'] loop
    if to_regclass(r) is not null then
      t1 := clock_timestamp(); perform private.refresh_mv(r::regclass);
      steps := steps || jsonb_build_object(r, round(extract(epoch from clock_timestamp() - t1) * 1000));
    end if;
  end loop;
  insert into public.lawd_region_map (region_code, region_name)
  select region_code, min(region_name) from public.market_transactions
  where property_type = 'apartment' and region_code is not null and region_code <> '' and region_name is not null and region_name <> ''
    and contract_ym >= to_char(now() - interval '9 months', 'YYYYMM')
  group by region_code on conflict (region_code) do update set region_name = excluded.region_name;
  insert into public.coverage_totals (id, tx_count, complex_count, region_count, refreshed_at)
  values (1, (select count(*) from public.market_transactions where property_type = 'apartment' and is_cancelled = false),
             (select count(*) from public.complex_tx_stats_base), (select count(distinct region_name) from public.market_transactions), now())
  on conflict (id) do update set tx_count = excluded.tx_count, complex_count = excluded.complex_count, region_count = excluded.region_count, refreshed_at = excluded.refreshed_at;
  return jsonb_build_object('ok', true, 'ms', round(extract(epoch from clock_timestamp() - t0) * 1000), 'steps', steps);
end $$;
alter table public.lawd_region_map enable row level security;
