/* 971 · 단지 대장 연결 — 이름이 아니라 "동 + 번지" 로 잇는다.
   (MCP apply_migration 으로 적용한 원문 그대로. 원장 version 20260906224959)

   ── 왜 ────────────────────────────────────────────────────────────────
   실거래(국토부)와 단지 대장(K-apt)은 같은 단지를 다른 이름으로 부른다.
   국토부 "리센츠" ↔ K-apt "잠실리센츠", 국토부 "성호" ↔ K-apt "호원성호".
   세대수를 잇던 두 매트뷰(complex_household_v2 · _byname_v2)는 공백만 지운
   이름의 **완전 일치**를 요구한다. 그래서 실거래가 있는 단지 33,182 개 중
   세대수가 붙은 건 9,337 개(28.1%)뿐이었다. 지도의 세대수 슬라이더와 단지
   카드가 대부분 비어 있던 이유가 이것이다.

   게다가 byname_v2 는 지역을 안 본다. 전국에서 이름만 같으면 붙는다.
   실측한 오답: 의정부 호원동 "성호" 에 1,728 세대(실제 416), 강동 천호동
   "두산위브센티움" 에 361 세대(실제 156), 남동구 "롯데캐슬골드" 에 400 세대
   (실제 3,384). 커버리지만 낮은 게 아니라 **틀린 값이 섞여 있었다**.

   주소는 두 원천이 같은 말을 한다. 실거래 주소는 "…동 번지" 로 끝나고,
   대장 jibunAddress 는 "시도 시군구 동 번지 이름" 이다. 같은 필지에 선
   아파트는 같은 아파트다 — 한 필지에 1·2차가 같이 선 경우만 걸러 내면 된다.

   ── 어떻게 ────────────────────────────────────────────────────────────
   (동, 번지)로 후보를 모으고 시군구 경로가 어긋나면 버린다. 대장 경로에는
   시도가 붙어 있으므로 "실거래 경로로 끝나는가" 로 본다("부산진구 초읍동"
   ⊂ "부산광역시부산진구초읍동"). 이 가드가 없으면 전국의 같은 이름 "중구·
   북구" 가 서로 붙는다.

   남은 후보에 두 단계 근거를 매긴다.
     1차 — 이름 열쇠(nz_link_name_key)가 한쪽이 다른 쪽을 품는다.
     2차 — 이름은 안 걸리지만 사용승인 연도와 건축년도가 ±1 년 안이다.
   더 좋은 단계가 하나라도 있으면 그 단계만 본다.

   그리고 **세대수가 갈리면 잇지 않는다.** 같은 필지에 세대수가 다른 대장
   행이 둘 이상 남으면 그 단지는 그냥 비운다. 2026-08-10 사고("공작아파트"
   패널에 공작럭키 스펙이 붙었다) 이후의 원칙 그대로다 — 스펙 없는 패널이
   옆 단지 스펙이 붙은 패널보다 낫다. 주차·동수·승강기·난방·시공사 같은
   나머지 스펙은 한 단계 더 엄격하게, 후보가 **정확히 하나**일 때만 싣는다.

   결과(적용 시점 실측): 연결 10,827 · 세대수 10,727(1차 8,195 · 2차 2,632).
   이름 매칭과 합치면 9,337 → 15,271 (28.1% → 46.0%).

   ── 권한 ──────────────────────────────────────────────────────────────
   새 매트뷰에는 service_role SELECT 만 준다. 앱은 이 경로를 전부 서비스
   롤로 읽는다(app/map/page.tsx · lib/complex/*). 지금 complex_tx_stats 에
   붙어 있는 anon SELECT 는 실제로 쓰이지 않는다 — 그 뷰는 security_invoker
   인데 밑단 complex_tx_stats_base 에 anon 권한이 없어 anon 조회는 오늘도
   42501 로 떨어진다(has_table_privilege 로 확인). 그래서 이 마이그레이션은
   권한을 넓히지 않는다. anon 은 잃을 게 없고 service_role 은 바뀌기 전
   객체에서 이미 갖고 있던 것과 같다.
*/

/* ── 1. 이름 열쇠 ─────────────────────────────────────────────────────
   브랜드 표기 흔들림을 흡수한다(아이파크/IPARK, 이편한세상/e편한세상 …).
   "아파트·단지·N차" 같은 꼬리는 떼서 "성호" ⊂ "호원성호" 가 성립하게 한다.
   "N차" 는 숫자를 요구한다 — 그냥 "차" 를 지우면 "차산·역차" 가 망가진다. */
create or replace function public.nz_link_name_key(v text)
returns text
language sql
immutable
parallel safe
set search_path to 'public'
as $fn$
  select nullif(
    regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(replace(replace(
      replace(replace(replace(replace(
        lower(coalesce(v, '')),
        ' ', ''),
        '아이파크', 'ipark'),
        '아이파트', 'ipark'),
        '푸르지오', 'prugio'),
        '자이', 'xi'),
        '래미안', 'raemian'),
        '이편한세상', 'e편한세상'),
        'e-편한세상', 'e편한세상'),
        'sk뷰', 'skview'),
        '에스케이뷰', 'skview'),
        '에스케이', 'sk'),
        '지에스', 'gs'),
        '엘지', 'lg'),
      '(아파트단지|아파트|단지|[0-9]+차|주상복합)', '', 'g'),
    '')
$fn$;

revoke execute on function public.nz_link_name_key(text) from public, anon, authenticated;

/* ── 2. 실거래 단지 → 대장 연결 ─────────────────────────────────────── */
create materialized view market_agg.complex_master_link as
with tx as (
  select b.region_name,
         b.complex_name,
         b.build_year,
         replace(coalesce(p[1], ''), ' ', '') as region_path,
         p[2]                                 as dong,
         rtrim(p[3], '-')                     as bunji
  from public.complex_tx_stats_base b
  cross join lateral (
    select regexp_match(b.address, '^(.*?)\s*(\S+)\s+((?:산)?[0-9]+(?:-[0-9]+)?-?)$') as p
  ) q
  where q.p is not null
    and public.nz_link_name_key(b.complex_name) is not null
),
master as (
  select a.external_id,
         a.name,
         (a.metadata ->> 'householdCount')::int as households,
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
         replace(coalesce(p[1], ''), ' ', '') as region_path,
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
pair as (
  select t.region_name,
         t.complex_name,
         m.external_id, m.households, m.kapt_code, m.road_address, m.builder,
         m.heating, m.approval_date, m.parking_count, m.building_count, m.elevator_count,
         case
           when position(public.nz_link_name_key(m.name) in public.nz_link_name_key(t.complex_name)) > 0
             or position(public.nz_link_name_key(t.complex_name) in public.nz_link_name_key(m.name)) > 0
             then 1
           when t.build_year is not null and m.approval_year is not null
                and abs(t.build_year - m.approval_year) <= 1
             then 2
         end as tier
  from tx t
  join master m
    on m.dong = t.dong
   and m.bunji = t.bunji
   and t.region_path <> ''
   and right(m.region_path, length(t.region_path)) = t.region_path
),
ranked as (
  select p.*, min(p.tier) over (partition by p.region_name, p.complex_name) as best_tier
  from pair p
  where p.tier is not null
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
