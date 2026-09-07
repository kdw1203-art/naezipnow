/* 971 · 지도 상세필터 RPC 를 새 해석 매트뷰로 옮긴다.
   (MCP apply_migration 으로 적용한 원문 그대로. 원장 version 20260906230714)

   ── 왜 별도 한 장인가 ──────────────────────────────────────────────────
   앞 장(20260906225257)이 market_agg.complex_households_resolved 를 DROP 했다.
   PostgreSQL 은 **함수 본문 안의 참조를 의존성으로 추적하지 않는다.** 그래서
   DROP 은 조용히 성공했고, 이 함수는 실행하는 순간에야
   42P01 relation does not exist 로 터진다. 게다가 이건 EXECUTE 로 감싼 동적
   SQL 이라 함수를 만들 때도 검사되지 않는다.

   실제로 그렇게 터졌다(적용 직후 호출해 확인). 지도 마커의 범위 슬라이더
   (가격·면적·준공·세대수)가 통째로 죽는 경로다 — /api/map/clusters 는 이
   조회가 실패해도 마커는 그리므로, 증상은 "필터를 켜면 마커가 사라진다" 라는
   조용한 형태로 나온다. 2026-07-25 사고와 같은 종류다.

   교훈: MV 를 지우기 전에 pg_proc.prosrc 를 이름으로 훑어야 한다.
     select proname from pg_proc where prosrc like '%<지울 이름>%';

   ── 바뀐 것 ────────────────────────────────────────────────────────────
   조인 대상 한 줄뿐이다(complex_households_resolved → complex_spec_resolved).
   시그니처·OUT 컬럼·SECURITY DEFINER·search_path 모두 그대로라 CREATE OR
   REPLACE 가 통하고, 따라서 anon·authenticated EXECUTE 권한도 그대로 남는다
   (지도는 로그인 없이 열리므로 이 권한이 사라지면 안 된다).
*/
create or replace function public.map_complex_attrs(
  p_min_lat double precision default null::double precision,
  p_max_lat double precision default null::double precision,
  p_min_lng double precision default null::double precision,
  p_max_lng double precision default null::double precision,
  p_limit integer default 300)
returns table(region_name text, complex_name text, avg_price_manwon bigint,
              avg_area_m2 numeric, build_year integer, households integer)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
BEGIN
  RETURN QUERY EXECUTE $q$
    with picked as (
      select g.region_name, g.complex_name, g.trade_count,
             b.avg_price_manwon, b.avg_area_m2, b.build_year
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
           h.households
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

revoke execute on function public.map_complex_attrs(
  double precision, double precision, double precision, double precision, integer) from public;
