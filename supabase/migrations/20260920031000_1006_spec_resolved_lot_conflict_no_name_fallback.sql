/* 1006 · 필지 근거가 "여러 단지" 라고 말하면 이름 매칭으로 세대수를 채우지 않는다.
   (MCP apply_migration 으로 적용한 원문 그대로. 원장 version 20260920031000)

   ── 왜 ────────────────────────────────────────────────────────────────
   complex_spec_resolved 는 세대수를 coalesce(필지 연결, 지역+이름, 이름) 순으로 고른다.
   필지 연결이 후보를 찾았는데 세대수가 갈려 비운 경우(같은 필지에 1~5단지가 선 곳)에도
   그대로 이름 매칭으로 떨어졌다. 실측(2026-09-20, 1006 1차 적용 직후):
       창원 성산구 "성원" (상남동 45-1, 최근 거래 227건)
         필지 후보 4개: 성원5단지 1,332 · 성원2단지 1,645 · 성원토월1단지 1,675 · 토월성원3단지 1,602
         → 필지 세대수 비움 → 이름 매칭이 다른 "성원" 410세대를 붙임
   필지가 "이 자리엔 단지가 여럿" 이라고 말해 주는데 이름만 같은 다른 단지의 값을 쓰는 것은
   2026-08-10 원칙(틀린 스펙이 빈 스펙보다 나쁘다) 위반이다. 해당 17단지(최근 거래 527건)는
   비운다 — 모르는 건 모르는 채로.

   필지 연결이 아예 없는 단지(match_tier null)는 그대로 이름 매칭을 쓴다 — 그쪽은 반대 증거가 없다.

   ── 다시 만드는 객체 ─────────────────────────────────────────────────
   complex_spec_resolved(MV) ← { map_facet_source(MV), public.complex_tx_stats(view) }.
   20260920030000 과 같은 이름·컬럼·인덱스·권한으로 복원한다. 새로 넓히는 권한 없음.
*/

drop view public.complex_tx_stats;
drop materialized view market_agg.map_facet_source;
drop materialized view market_agg.complex_spec_resolved;

create materialized view market_agg.complex_spec_resolved as
select b.region_name,
       b.complex_name,
       coalesce(l.households,
                case when l.match_tier is null then v2.households end,
                case when l.match_tier is null then bn.households end) as households,
       case when l.households is not null then 'lot'
            when l.match_tier is null and v2.households is not null then 'region-name'
            when l.match_tier is null and bn.households is not null then 'name'
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

create view public.complex_tx_stats
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

grant all on public.complex_tx_stats to service_role;
grant select on public.complex_tx_stats to anon, authenticated;

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
