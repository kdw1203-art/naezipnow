/* [1007] complex_pair_mv 재생성 — 2026-07 신설 행정구역 5곳을 지역 allowlist 에.
   (2026-09-20 MCP 적용 완료 — 인덱스 2건은 execute_sql 로 CONCURRENTLY 생성 뒤 원장에 멱등 기록, MV 는 apply_migration 한 트랜잭션. 원장 version 은 파일명 그대로.)

   ── 왜 ────────────────────────────────────────────────────────────────
   경보 warn `seo.region_coverage`(1003·1005·1006 에서 이월): 실거래가 이미 쌓인 화성 동탄구(3,931건)·
   세종시(2,079)·화성 병점구(1,909)·효행구(965)·만세구(673)에 단지 비교(pair) 페이지가 없다. 원인은
   20260726120000 의 MV 정의 안에 지역 allowlist 가 **문자열로 하드코딩**돼 있어서다("화성시 동탄"·
   "화성 동탄" 은 있지만 개편 뒤 실거래 표기 "화성 동탄구"(molitRegionLabel: "화성시 동탄구" → "화성 동탄구")
   는 없다). MV 는 CREATE OR REPLACE 가 없으니 정의를 바꾸려면 다시 만들어야 한다.

   ── 무엇이 바뀌나 ───────────────────────────────────────────────────────
   allowlist 에 아래를 더한다(카탈로그 lib/map/seoul-districts.ts [998] 표기 + 실거래 표기 양쪽):
     '화성시 동탄구','화성 동탄구','화성시 병점구','화성 병점구','화성시 효행구','화성 효행구',
     '화성시 만세구','화성 만세구','세종시','세종','세종특별자치시'
   통과 기준(같은 동 · 양쪽 12개월 매매 20건 이상 · 동별 상위 3개 단지 · 교차 도시 중복 서명 제외 ·
   이름에 '--' 없음)과 컬럼·인덱스·권한은 **그대로**다. 옛 항목('화성시 동탄'·'화성 동탄')은 지우지 않는다.

   ── 의존 객체 확인 절차(적용 직전에 실행) ────────────────────────────────
   1) 이 MV 에 기대는 객체:
        select classid::regclass, objid::regclass, deptype from pg_depend
         where refobjid = 'market_agg.complex_pair_mv'::regclass and deptype in ('n','a');
      예상: public.complex_pair_source(뷰, security_invoker) 와 자기 인덱스 2개뿐.
      refresh_market_aggregates() 는 이름('market_agg.complex_pair_mv'::regclass)으로 REFRESH 하므로
      의존이 없고 손대지 않는다(20260802095822 정의 그대로).
   2) 현재 권한(복원 대상 — 실측과 다르면 실측을 따른다):
        select relname, relacl from pg_class where relname in ('complex_pair_mv','complex_pair_source');
      저장소 기록: MV — service_role SELECT(20260726120000) + anon·authenticated SELECT(20260726140000,
      빌드 프리렌더용). 뷰 — service_role·anon·authenticated SELECT. 새로 넓히는 권한 없음.
   3) ETL 창을 피한다: refresh_market_aggregates() 가 REFRESH 중이면 DROP 이 그 잠금을 기다린다 —
      .github/workflows/etl.yml market-agg(00:00·09:00 UTC) 와 Vercel 크론 market-aggregates-refresh
      시각을 피해서 적용.

   ── 무중단 순서(한 트랜잭션 안에서도 안전) ───────────────────────────────
   A. 새 MV 를 **다른 이름으로 WITH DATA** 로 먼저 만든다 — 라이브 MV·뷰에 잠금이 안 걸린다.
   B. 뷰를 CREATE OR REPLACE 로 새 MV 를 보게 바꾼다(컬럼 동일 — 뷰 OID·권한 유지).
   C. 옛 MV 를 지우고(이제 의존 0) 새 MV·인덱스를 원래 이름으로 rename → refresh 함수·VACUUM 목록
      (20260908230000)이 쓰는 이름이 그대로 맞는다. 뷰는 OID 로 참조하므로 rename 뒤에도 그대로 동작.
   D. 새 MV 에 권한 복원 + comment.
   페이지가 비는 순간이 없다(뷰는 B 직후부터 새 MV 를 읽고, 그 MV 는 A 에서 이미 채워졌다).

   ── 적용 뒤 확인 ────────────────────────────────────────────────────────
     select region_name, count(*) from public.complex_pair_source
      where region_name in ('화성 동탄구','화성 병점구','화성 효행구','화성 만세구','세종시') group by 1;
     select public.refresh_market_aggregates();   -- CONCURRENTLY 경로가 유일 인덱스를 찾는지
   ※ 코드 쪽 주의(통합자): lib/market/complex-transactions.ts 의 ALL_REGIONS 는 SEOUL + METRO_EXPLORE 만
     포함하고 세종(METRO_CITY_DISTRICTS)은 빠져 있다 → toPair() 가 '세종시' 행을 지역 미해석으로 버린다.
     세종 pair 페이지를 실제로 내려면 그 목록에 세종을 더해야 한다(화성 4구는 METRO_EXPLORE 에 있어 바로 된다).

   되돌림: 20260726120000 의 정의로 같은 순서(A~D)로 되돌린다.
   권한: 아래 GRANT 는 전부 기존 권한의 복원(20260726120000 + 20260726140000) — 새 권한 없음. */

-- ── A. 새 정의로 먼저 채운다(라이브 객체 잠금 없음) ───────────────────────
create materialized view market_agg.complex_pair_mv_1007 as
with win as (
  select region_name, complex_name, address, contract_ym, created_at
    from public.market_transactions
   where transaction_type = 'trade'
     and property_type = 'apartment'
     and coalesce(is_cancelled, false) = false
     and contract_ym >= to_char((now() at time zone 'Asia/Seoul') - interval '12 months', 'YYYYMM')
     and address is not null
     and complex_name is not null
     and region_name is not null
),
sig as (
  select region_name,
         count(*)::text || '|' || count(distinct complex_name)::text || '|' ||
         min(complex_name) || '|' || max(complex_name) || '|' || max(contract_ym) as s
    from win
   group by 1
),
dup_region as (
  select region_name from sig where s in (select s from sig group by s having count(*) > 1)
),
scope as (
  select * from win
   where position('--' in complex_name) = 0
     and region_name not in (select region_name from dup_region)
     and region_name in (
       '강남구','서울 강남구','강동구','서울 강동구','강북구','서울 강북구','강서구','서울 강서구',
       '관악구','서울 관악구','광진구','서울 광진구','구로구','서울 구로구','금천구','서울 금천구',
       '노원구','서울 노원구','도봉구','서울 도봉구','동대문구','서울 동대문구','동작구','서울 동작구',
       '마포구','서울 마포구','서대문구','서울 서대문구','서초구','서울 서초구','성동구','서울 성동구',
       '성북구','서울 성북구','송파구','서울 송파구','양천구','서울 양천구','영등포구','서울 영등포구',
       '용산구','서울 용산구','은평구','서울 은평구','종로구','서울 종로구','중구','서울 중구',
       '중랑구','서울 중랑구',
       '성남시 분당구','성남 분당구','성남시 수정구','성남 수정구','성남시 중원구','성남 중원구',
       '수원시 영통구','수원 영통구','수원시 장안구','수원 장안구','수원시 팔달구','수원 팔달구',
       '수원시 권선구','수원 권선구',
       '용인시 수지구','용인 수지구','용인시 기흥구','용인 기흥구','용인시 처인구','용인 처인구',
       '고양시 일산동구','고양 일산동구','고양시 일산서구','고양 일산서구','고양시 덕양구','고양 덕양구',
       '안양시 동안구','안양 동안구','안양시 만안구','안양 만안구',
       '부천시','광명시','하남시','남양주시','김포시','의정부시',
       '안산시 단원구','안산 단원구','안산시 상록구','안산 상록구',
       '화성시 동탄','화성 동탄','과천시','의왕시','군포시','구리시','시흥시','평택시',
       '연수구','인천 연수구','남동구','인천 남동구','부평구','인천 부평구','서구','인천 서구',
       '미추홀구','인천 미추홀구','계양구','인천 계양구','인천 중구',
       -- [1007] 2026-07 행정구역 개편 — 화성시 4개 구 · 세종시 (seo.region_coverage 경보 5곳)
       '화성시 동탄구','화성 동탄구','화성시 병점구','화성 병점구','화성시 효행구','화성 효행구',
       '화성시 만세구','화성 만세구','세종시','세종','세종특별자치시'
     )
),
base as (
  select region_name,
         complex_name,
         (select t from regexp_split_to_table(address, ' ') t where t ~ '(동|가|읍|면)$' limit 1) as dong,
         count(*)::integer as trade_count,
         max(contract_ym) as last_contract_ym,
         max(created_at) as last_data_at
    from scope
   group by 1, 2, 3
),
qualified as (
  select * from base where dong is not null and trade_count >= 20
),
ranked as (
  select *, row_number() over (partition by region_name, dong order by trade_count desc, complex_name) as rn
    from qualified
),
top3 as (
  select * from ranked where rn <= 3
),
pairs as (
  select a.region_name,
         a.dong,
         a.complex_name as complex_a,
         b.complex_name as complex_b,
         a.trade_count as trade_count_a,
         b.trade_count as trade_count_b,
         (a.trade_count + b.trade_count)::integer as pair_trade_count,
         greatest(a.last_contract_ym, b.last_contract_ym) as last_contract_ym,
         greatest(a.last_data_at, b.last_data_at) as last_data_at
    from top3 a
    join top3 b
      on a.region_name = b.region_name
     and a.dong = b.dong
     and a.complex_name < b.complex_name
)
select distinct on (region_name, complex_a, complex_b)
       region_name, dong, complex_a, complex_b,
       trade_count_a, trade_count_b, pair_trade_count,
       last_contract_ym, last_data_at
  from pairs
 order by region_name, complex_a, complex_b, pair_trade_count desc, dong
  with data;

-- REFRESH ... CONCURRENTLY 의 전제 조건이자 페이지 조회 키(이름은 C 에서 원래대로).
create unique index complex_pair_mv_1007_key
  on market_agg.complex_pair_mv_1007 (region_name, complex_a, complex_b);

create index complex_pair_mv_1007_rank
  on market_agg.complex_pair_mv_1007 (pair_trade_count desc, region_name, complex_a, complex_b)
  include (dong, trade_count_a, trade_count_b, last_data_at, last_contract_ym);

-- ── B. 뷰가 새 MV 를 보게(컬럼 동일 — 뷰 OID·기존 GRANT 유지) ────────────────
create or replace view public.complex_pair_source with (security_invoker = on) as
  select region_name, dong, complex_a, complex_b,
         trade_count_a, trade_count_b, pair_trade_count,
         last_contract_ym, last_data_at
    from market_agg.complex_pair_mv_1007;

-- ── C. 옛 MV 제거(의존 0) → 새 객체를 원래 이름으로 ───────────────────────
drop materialized view market_agg.complex_pair_mv;
alter materialized view market_agg.complex_pair_mv_1007 rename to complex_pair_mv;
alter index market_agg.complex_pair_mv_1007_key rename to complex_pair_mv_key;
alter index market_agg.complex_pair_mv_1007_rank rename to complex_pair_mv_rank;

-- ── D. 권한 복원(20260726120000 + 20260726140000 그대로 — 새 권한 없음) + comment ──
grant select on market_agg.complex_pair_mv to service_role;
grant select on market_agg.complex_pair_mv to anon, authenticated;

comment on materialized view market_agg.complex_pair_mv is
  'N10 단지 비교 랜딩(/complex/compare/[slug]) 화이트리스트. 같은 동·양쪽 12개월 20건 이상·동별 거래 상위 3개 단지 조합만. [1007] 화성 4구·세종 포함. public.complex_pair_source 로만 읽고 refresh_market_aggregates() 가 갱신한다.';

comment on view public.complex_pair_source is
  'N10 단지 비교 랜딩 화이트리스트 소스. market_agg.complex_pair_mv 를 읽는다.';
