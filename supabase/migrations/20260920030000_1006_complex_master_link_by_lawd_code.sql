/* 1006 · 단지 대장 연결 — 시군구를 문자열 경로가 아니라 법정동코드로 맞춘다 + 동 안 유일 이름(3단계).
   (MCP apply_migration 으로 적용한 원문 그대로. 원장 version 20260920030000)

   ── 왜 ────────────────────────────────────────────────────────────────
   971 의 complex_master_link 는 실거래 주소와 대장 jibunAddress 를 "동 + 번지" 로
   잇되, 시군구가 어긋나지 않도록 "대장 경로가 실거래 경로로 **끝나는가**" 를 봤다.
   그런데 실거래 주소의 시군구 표기가 적재 시기마다 다르다(2026-09-20 실측):
       "서울 송파구 잠실동 22"        → 경로 "서울송파구"     ⊄ "서울특별시송파구"  (시도 약칭)
       "안양시 만안구 안양동 1393"    → 경로 "안양시만안구"   ⊄ "경기도안양만안구"  (K-apt 는 "안양만안구")
       "도봉구 방학동 271-1"          → 경로 "도봉구"         ⊂ "서울특별시도봉구"  (이것만 통과)
   즉 시도가 앞에 붙었거나 "OO시 OO구" 꼴이면 같은 필지여도 연결이 거부됐다.
   리센츠(잠실동 22)·잠실엘스(잠실동 19)·파크리오(신천동 17)가 대장에 같은 번지로
   있는데도 세대수가 비어 있던 이유가 이것이다. 실거래 단지 36,714 중 12,172(33%)만
   연결돼 있었고, 연결 안 된 24,542 단지에 최근 거래의 절반(160,732건)이 있었다.

   양쪽 다 **5자리 법정동코드**를 갖고 있다 — 실거래는 lawd_region_map(region_name →
   region_code, 254 지역 전부 대응), 대장은 apartment_complexes.lawd_cd(22,311행 중
   22,309 가 map 안). 코드가 같으면 시군구가 같다. 문자열 경로 비교를 코드 등치로
   바꾼다. 나머지 판정(동·번지 일치 → 1차 이름 열쇠 포함 / 2차 사용승인 ±1년, 세대수가
   갈리면 비움, 스펙은 후보 1개일 때만)은 971 그대로다.

   ── 3단계(새로) ─────────────────────────────────────────────────────
   대장이 대표 필지 하나만 적어서 번지가 다른 단지가 있다(헬리오시티: 실거래 "가락동 913",
   대장 "가락동 479"). 같은 법정동코드 + 같은 법정동 안에서 이름 열쇠가 한쪽을 품고,
   그런 대장 후보가 **정확히 하나**일 때만 잇는다(열쇠 3자 이상 — "현대·삼성·우성" 같은
   두 글자 열쇠는 동 안에서도 판별력이 없다). 후보가 둘이면(래미안1차·2차는 열쇠가 같다)
   잇지 않는다 — 2026-08-10 원칙(틀린 스펙이 빈 스펙보다 나쁘다) 그대로.

   ── 적용 전 실측(읽기 전용 쿼리, 2026-09-20) ─────────────────────────
   코드 등치만으로 연결 12,172 → 15,552 (+3,380). 3단계는 적용 뒤 etl_runs 의
   refresh 결과(households_linked)와 아래 검증 쿼리로 확인한다.

   ── 왜 네 객체를 다시 만드나 ────────────────────────────────────────
   MV 는 정의를 바꿀 수 없다(REPLACE 없음). pg_depend 실측 의존 사슬:
       complex_master_link ← complex_spec_resolved ← { map_facet_source, public.complex_tx_stats(view) }
   그 넷을 한 트랜잭션에서 내리고 같은 이름·같은 컬럼·같은 인덱스·같은 권한으로 다시
   세운다. 다른 의존 객체는 없다(3단계 의존 0건). refresh_market_aggregates() 는 이름으로
   REFRESH 하므로 손대지 않는다.

   ── 권한 ──────────────────────────────────────────────────────────────
   새로 넓히는 권한은 없다. 적용 직전 실측 ACL 을 그대로 복원한다:
       complex_master_link / complex_spec_resolved / map_facet_source : service_role SELECT
       public.complex_tx_stats(view, security_invoker) : service_role ALL · anon SELECT · authenticated SELECT
   (anon·authenticated 의 뷰 SELECT 는 밑단 complex_tx_stats_base 에 권한이 없어 오늘도
    42501 로 떨어진다 — 971 주석과 같다. 있던 그대로 두는 것이지 여는 것이 아니다.)
*/

drop view public.complex_tx_stats;
drop materialized view market_agg.map_facet_source;
drop materialized view market_agg.complex_spec_resolved;
drop materialized view market_agg.complex_master_link;

/* ── 1. 실거래 단지 → 대장 연결 ─────────────────────────────────────── */
create materialized view market_agg.complex_master_link as
with tx as (
  select b.region_name,
         b.complex_name,
         b.build_year,
         r.region_code,
         p[2]                                 as dong,
         rtrim(p[3], '-')                     as bunji,
         public.nz_link_name_key(b.complex_name) as name_key
  from public.complex_tx_stats_base b
  join public.lawd_region_map r on r.region_name = b.region_name
  cross join lateral (
    select regexp_match(b.address, '^(.*?)\s*(\S+)\s+((?:산)?[0-9]+(?:-[0-9]+)?-?)$') as p
  ) q
  where q.p is not null
    and public.nz_link_name_key(b.complex_name) is not null
),
master as (
  select a.lawd_cd,
         a.external_id,
         a.name,
         public.nz_link_name_key(a.name)           as name_key,
         (a.metadata ->> 'householdCount')::int    as households,
         nullif(a.metadata ->> 'kaptCode', '')     as kapt_code,
         nullif(a.metadata ->> 'roadAddress', '')  as road_address,
         nullif(a.metadata ->> 'builder', '')      as builder,
         nullif(a.metadata ->> 'heating', '')      as heating,
         nullif(a.metadata ->> 'approvalDate', '') as approval_date,
         case when a.metadata ->> 'parkingCount'  ~ '^[0-9]+$'
              then (a.metadata ->> 'parkingCount')::int end  as parking_count,
         case when a.metadata ->> 'buildingCount' ~ '^[0-9]+$'
              then (a.metadata ->> 'buildingCount')::int end as building_count,
         case when a.metadata ->> 'elevatorCount' ~ '^[0-9]+$'
              then (a.metadata ->> 'elevatorCount')::int end as elevator_count,
         case when a.metadata ->> 'approvalDate' ~ '^[0-9]{4}'
              then left(a.metadata ->> 'approvalDate', 4)::int end as approval_year,
         p[2]                                 as dong,
         rtrim(p[3], '-')                     as bunji
  from public.apartment_complexes a
  cross join lateral (
    select regexp_match(a.metadata ->> 'jibunAddress',
                        '^(.*?)\s*(\S+)\s+((?:산)?[0-9]+(?:-[0-9]+)?-?)(?:\s|$)') as p
  ) q
  where a.source_key = 'k-apt-basic'
    and a.metadata ->> 'householdCount' ~ '^[0-9]+$'
    and q.p is not null
    and public.nz_link_name_key(a.name) is not null
),
/* 1·2단계 — 같은 법정동코드 + 같은 동 + 같은 번지 */
pair_lot as (
  select t.region_name,
         t.complex_name,
         m.external_id, m.households, m.kapt_code, m.road_address, m.builder,
         m.heating, m.approval_date, m.parking_count, m.building_count, m.elevator_count,
         case
           when position(m.name_key in t.name_key) > 0
             or position(t.name_key in m.name_key) > 0
             then 1
           when t.build_year is not null and m.approval_year is not null
                and abs(t.build_year - m.approval_year) <= 1
             then 2
         end as tier
  from tx t
  join master m
    on m.lawd_cd = t.region_code
   and m.dong    = t.dong
   and m.bunji   = t.bunji
),
lot_linked as (
  select distinct region_name, complex_name from pair_lot where tier is not null
),
/* 3단계 — 번지는 다르지만 같은 법정동코드 + 같은 동 안에서 이름 열쇠가 한쪽을 품는
   대장 후보가 정확히 하나. 1·2단계로 이어진 단지는 여기 오지 않는다. */
pair_name as (
  select t.region_name,
         t.complex_name,
         m.external_id, m.households, m.kapt_code, m.road_address, m.builder,
         m.heating, m.approval_date, m.parking_count, m.building_count, m.elevator_count,
         3 as tier,
         count(*) over (partition by t.region_name, t.complex_name) as cand
  from tx t
  join master m
    on m.lawd_cd = t.region_code
   and m.dong    = t.dong
   and (position(m.name_key in t.name_key) > 0 or position(t.name_key in m.name_key) > 0)
  where length(t.name_key) >= 3
    and length(m.name_key) >= 3
    and not exists (
      select 1 from lot_linked l
      where l.region_name = t.region_name and l.complex_name = t.complex_name
    )
),
pair as (
  select region_name, complex_name, external_id, households, kapt_code, road_address, builder,
         heating, approval_date, parking_count, building_count, elevator_count, tier
  from pair_lot where tier is not null
  union all
  select region_name, complex_name, external_id, households, kapt_code, road_address, builder,
         heating, approval_date, parking_count, building_count, elevator_count, tier
  from pair_name where cand = 1
),
ranked as (
  select p.*, min(p.tier) over (partition by p.region_name, p.complex_name) as best_tier
  from pair p
),
agg as (
  select region_name,
         complex_name,
         min(tier)                  as match_tier,
         count(*)                   as match_count,
         count(distinct households) as hh_variants,
         min(households)            as households,
         min(external_id)           as master_external_id,
         min(kapt_code)             as kapt_code,
         min(road_address)          as road_address,
         min(builder)               as builder,
         min(heating)               as heating,
         min(approval_date)         as approval_date,
         min(parking_count)         as parking_count,
         min(building_count)        as building_count,
         min(elevator_count)        as elevator_count
  from ranked
  where tier = best_tier
  group by region_name, complex_name
)
select region_name,
       complex_name,
       match_tier,
       match_count,
       /* 세대수는 후보들이 한 값으로 모일 때만. 갈리면 비운다. */
       case when hh_variants = 1 then households end          as households,
       /* 나머지 스펙은 후보가 하나일 때만 — 1·2차가 섞이면 남의 스펙이 된다. */
       case when match_count = 1 then master_external_id end  as master_external_id,
       case when match_count = 1 then kapt_code end           as kapt_code,
       case when match_count = 1 then road_address end        as road_address,
       case when match_count = 1 then builder end             as builder,
       case when match_count = 1 then heating end             as heating,
       case when match_count = 1 then approval_date end       as approval_date,
       case when match_count = 1 then parking_count end       as parking_count,
       case when match_count = 1 then building_count end      as building_count,
       case when match_count = 1 then elevator_count end      as elevator_count
from agg;

create unique index complex_master_link_pk
  on market_agg.complex_master_link (region_name, complex_name);

revoke all on market_agg.complex_master_link from anon, authenticated;
grant select on market_agg.complex_master_link to service_role;

/* ── 2. 세대수·스펙 단일 해석 (971 정의 그대로) ─────────────────────── */
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

/* ── 3. 화면이 읽는 뷰 (971 정의·컬럼 순서 그대로, 적용 직전 ACL 복원) ── */
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

/* ── 4. 지도 패싯 원천 (971 정의·인덱스 2개·권한 그대로) ──────────────── */
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
