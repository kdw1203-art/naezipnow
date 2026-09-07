/* 971 · 세대수·단지 스펙 단일 해석 + 읽는 쪽 재배선.
   (MCP apply_migration 으로 적용한 원문 그대로. 원장 version 20260906225257)

   complex_master_link(동+번지) 를 1순위로 두고, 이름 매칭 두 개를 뒤에 붙인다.
   실측 근거로 순서를 이렇게 잡았다 — 두 방식이 갈린 506 건을 표본 확인했더니
   필지 기반이 맞고 이름 기반이 틀렸다(호원성호 416 vs 1,728 등).
   households_source 를 같이 실어 어느 근거로 붙은 값인지 화면·로그에서 구분한다.

   complex_tx_stats 는 DROP 하지 않는다 — CREATE OR REPLACE 는 GRANT 를 지우지
   않는다. 기존 10 컬럼의 이름·타입·순서를 그대로 두고 뒤에만 덧붙였다
   (그래야 REPLACE 가 허용된다). 새 컬럼은 단지 상세 패널이 K-apt 스펙을
   이름 매칭 없이 바로 읽게 하려고 낸 자리다.

   map_facet_source 는 MV 라 REPLACE 가 없어 DROP + CREATE 다. 그래서 인덱스
   두 개와 GRANT 를 여기서 다시 만든다 — 2026-07-25 에 이걸 빠뜨려 /tx 가
   하루 죽었다(scripts/check-source-views.mjs 가 그 사고의 산물이다).
*/

create materialized view market_agg.complex_spec_resolved as
select b.region_name,
       b.complex_name,
       coalesce(l.households, v2.households, bn.households) as households,
       case when l.households  is not null then 'lot'
            when v2.households is not null then 'region-name'
            when bn.households is not null then 'name'
       end as households_source,
       l.match_tier,
       l.master_external_id,
       l.kapt_code,
       l.road_address,
       l.builder,
       l.heating,
       l.approval_date,
       l.parking_count,
       l.building_count,
       l.elevator_count
from public.complex_tx_stats_base b
cross join lateral (select public.nz_norm_complex_name(b.complex_name) as nn) x
left join market_agg.complex_master_link l
       on l.region_name = b.region_name and l.complex_name = b.complex_name
left join market_agg.complex_household_v2 v2
       on v2.region_name = b.region_name and v2.norm_name = x.nn
left join market_agg.complex_household_byname_v2 bn
       on bn.norm_name = x.nn;

create unique index complex_spec_resolved_pk
  on market_agg.complex_spec_resolved (region_name, complex_name);

revoke all on market_agg.complex_spec_resolved from anon, authenticated;
grant select on market_agg.complex_spec_resolved to service_role;

create or replace view public.complex_tx_stats
with (security_invoker = on) as
select b.region_name,
       b.complex_name,
       b.address,
       b.trade_count,
       b.tx_count,
       b.recent_trade_count,
       b.avg_price_manwon,
       b.avg_area_m2,
       b.build_year,
       s.households,
       s.households_source,
       s.parking_count,
       s.building_count,
       s.elevator_count,
       s.heating,
       s.builder,
       s.approval_date,
       s.road_address
from public.complex_tx_stats_base b
left join market_agg.complex_spec_resolved s
       on s.region_name = b.region_name and s.complex_name = b.complex_name;

drop materialized view market_agg.map_facet_source;

create materialized view market_agg.map_facet_source as
select g.region_name,
       g.complex_name,
       g.lat,
       g.lng,
       b.avg_price_manwon::numeric as price,
       b.avg_area_m2               as area,
       b.build_year::numeric       as yr,
       s.households::numeric       as hh
from public.complex_geocode g
join public.complex_tx_stats_base b
  on b.region_name = g.region_name and b.complex_name = g.complex_name
left join market_agg.complex_spec_resolved s
  on s.region_name = g.region_name and s.complex_name = g.complex_name
where g.status = 'ok' and g.lat is not null and g.lng is not null;

create unique index map_facet_source_pk
  on market_agg.map_facet_source (region_name, complex_name);
create index map_facet_source_latlng
  on market_agg.map_facet_source (lat, lng) include (price, area, yr, hh);

revoke all on market_agg.map_facet_source from anon, authenticated;
grant select on market_agg.map_facet_source to service_role;

/* 이제 아무도 참조하지 않는다 — complex_spec_resolved 가 흡수했다. */
drop materialized view market_agg.complex_households_resolved;
