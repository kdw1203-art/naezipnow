-- [새 프로젝트 보충 2] 운영에서는 저장소 밖 마이그레이션이 세대수 MV 를 market_agg 로 옮기고 두 집계를 만들었다. 뒤 마이그레이션(971)이 그 자리를 전제로 한다.
do $$ begin
  if to_regclass('public.complex_household_v2') is not null then alter materialized view public.complex_household_v2 set schema market_agg; end if;
  if to_regclass('public.complex_household_byname_v2') is not null then alter materialized view public.complex_household_byname_v2 set schema market_agg; end if;
end $$;
create materialized view if not exists market_agg.complex_households_resolved as
  select b.region_name, b.complex_name, v2.households
  from public.complex_tx_stats_base b
  left join market_agg.complex_household_v2 v2 on v2.region_name = b.region_name and v2.norm_name = public.nz_norm_complex_name(b.complex_name);
create unique index if not exists complex_households_resolved_pk on market_agg.complex_households_resolved (region_name, complex_name);
create materialized view if not exists market_agg.map_facet_source as
  select g.region_name, g.complex_name, g.lat, g.lng, b.avg_price_manwon::numeric as price, b.avg_area_m2 as area, b.build_year::numeric as yr, r.households::numeric as hh
  from public.complex_geocode g
  join public.complex_tx_stats_base b on b.region_name = g.region_name and b.complex_name = g.complex_name
  left join market_agg.complex_households_resolved r on r.region_name = g.region_name and r.complex_name = g.complex_name
  where g.status = 'ok' and g.lat is not null and g.lng is not null;
create unique index if not exists map_facet_source_pk on market_agg.map_facet_source (region_name, complex_name);
create or replace function public.map_filter_facets(p_min_lat double precision default null, p_max_lat double precision default null, p_min_lng double precision default null, p_max_lng double precision default null, p_buckets integer default 24)
returns jsonb language plpgsql volatile security definer set search_path = public, market_agg, pg_temp as $$
declare b integer := greatest(4, least(coalesce(p_buckets, 24), 60)); res jsonb := '{}'::jsonb; ax record; lo numeric; hi numeric; n bigint; bins jsonb; total bigint;
begin
  create temp table if not exists _mf (price numeric, area numeric, yr numeric, hh numeric) on commit drop;
  truncate _mf;
  insert into _mf select s.price, s.area, s.yr, s.hh from market_agg.map_facet_source s
   where (p_min_lat is null or s.lat between p_min_lat and p_max_lat) and (p_min_lng is null or s.lng between p_min_lng and p_max_lng);
  select count(*) into total from _mf;
  for ax in select * from (values ('price','price'), ('area','area'), ('year','yr'), ('households','hh')) v(k, col) loop
    execute format('select percentile_cont(0.01) within group (order by %1$I), percentile_cont(0.99) within group (order by %1$I), count(%1$I) from _mf', ax.col) into lo, hi, n;
    if n = 0 or lo is null then
      res := res || jsonb_build_object(ax.k, jsonb_build_object('lo', null, 'hi', null, 'n', 0, 'bins', (select coalesce(jsonb_agg(0), '[]'::jsonb) from generate_series(1, b))));
    else
      execute format('select jsonb_agg(coalesce(c.n, 0) order by g.i) from generate_series(1, %2$s) g(i) left join (select least(%2$s, greatest(1, case when %4$s = %3$s then 1 else width_bucket(%1$I, %3$s, %4$s, %2$s) end)) i, count(*) n from _mf where %1$I is not null group by 1) c on c.i = g.i', ax.col, b, lo, hi) into bins;
      res := res || jsonb_build_object(ax.k, jsonb_build_object('lo', lo, 'hi', hi, 'n', n, 'bins', bins));
    end if;
  end loop;
  return res || jsonb_build_object('total', total, 'buckets', b);
end $$;
revoke all on function public.map_filter_facets(double precision, double precision, double precision, double precision, integer) from public, anon, authenticated;
grant execute on function public.map_filter_facets(double precision, double precision, double precision, double precision, integer) to service_role;
