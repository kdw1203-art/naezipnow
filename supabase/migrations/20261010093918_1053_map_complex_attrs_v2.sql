-- [1053 · 지도 상세 필터 2] 지도 마커에 거는 단지 속성을 넓힌다 — map_complex_attrs 의 새 판(v2).
-- 소유자 지시(2026-10-10): "지도에서 필터라던지 보여지는 정보에 대해 더 다양하고 디테일한 필터와 정보를 제공".
-- 예전(v1): 가격 · 면적 · 준공 · 세대수 네 축. 같은 매트뷰(market_agg.complex_spec_resolved · K-apt 대장)에 이미 있는
--   난방 · 시공사 · 주차대수 · 동 수 · 승강기 수와 최근 6개월 매매 건수(complex_tx_stats_base)를 함께 돌려준다.
-- 왜 새 이름인가: OUT 컬럼이 늘면 CREATE OR REPLACE 로는 바꿀 수 없다. v1 은 그대로 두고(정비사업 주변 단지 · 단지 주변 지도가 쓴다)
--   지도만 v2 를 부른다. v2 가 없거나 실패하면 지도는 v1 로 되돌아간다(app/api/map/clusters).
-- 권한: 서버 읽기 클라이언트(service_role)만 — public · anon · authenticated 회수.
-- 멱등: create or replace.

create or replace function public.map_complex_attrs_v2(
  p_min_lat double precision default null::double precision,
  p_max_lat double precision default null::double precision,
  p_min_lng double precision default null::double precision,
  p_max_lng double precision default null::double precision,
  p_limit integer default 300)
returns table(region_name text, complex_name text, avg_price_manwon bigint,
              avg_area_m2 numeric, build_year integer, households integer,
              recent_trade_count bigint, parking_count integer, building_count integer,
              elevator_count integer, heating text, builder text)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
BEGIN
  RETURN QUERY EXECUTE $q$
    with picked as (
      select g.region_name, g.complex_name, g.trade_count,
             b.avg_price_manwon, b.avg_area_m2, b.build_year, b.recent_trade_count
      from public.complex_geocode g
      join public.complex_tx_stats_base b
        on b.region_name = g.region_name and b.complex_name = g.complex_name
      where g.status = 'ok' and g.lat is not null and g.lng is not null
        and g.lat between $1 and $2
        and g.lng between $3 and $4
      order by g.trade_count desc nulls last
      limit $5
    )
    select p.region_name, p.complex_name, p.avg_price_manwon, p.avg_area_m2, p.build_year,
           h.households, p.recent_trade_count, h.parking_count, h.building_count,
           h.elevator_count, nullif(h.heating, ''), nullif(h.builder, '')
    from picked p
    left join market_agg.complex_spec_resolved h
           on h.region_name = p.region_name and h.complex_name = p.complex_name
    order by p.trade_count desc nulls last
  $q$
  USING coalesce(p_min_lat, -90.0), coalesce(p_max_lat, 90.0),
        coalesce(p_min_lng, -180.0), coalesce(p_max_lng, 180.0),
        greatest(1, least(1000, coalesce(p_limit, 300)));
END;
$function$;

revoke all on function public.map_complex_attrs_v2(
  double precision, double precision, double precision, double precision, integer) from public, anon, authenticated;
grant execute on function public.map_complex_attrs_v2(
  double precision, double precision, double precision, double precision, integer) to service_role;