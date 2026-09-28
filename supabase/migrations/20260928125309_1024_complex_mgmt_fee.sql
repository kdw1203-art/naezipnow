-- [1024] 단지 관리비(K-apt) 표 + 관리비 적재 후보 뷰. 추가 전용 · 지우는 것 없음.
--
-- ── 왜 ──────────────────────────────────────────────────────────────────
-- 호갱노노 등 타 사이트 단지 화면에는 관리비가 있고 우리 단지 상세에는 없다(브리프 1024 실측).
-- K-apt 공동주택 관리비 API(공용관리비 AptCmnuseManageCostService · 개별사용료 AptIndvdlzManageCostService)
-- 를 매일 200곳씩 읽어 여기 쌓는다. 쓰는 곳: lib/national-data/kapt-mgmt-fee-ingest.ts(쓰기),
-- lib/complex/mgmt-fee.ts(읽기 — 단지 상세 관리비 카드, 행이 없으면 카드 생략).
--
-- ── 키 ──────────────────────────────────────────────────────────────────
-- (kapt_code, ym). kapt_code = apartment_complexes.external_id(source_key='k-apt-basic'). FK 는 두지 않는다 —
-- 대장은 (source_key, external_id) 유니크라 단일 컬럼 FK 를 걸 수 없고, 대장 행이 재적재로 바뀌어도 관리비
-- 이력은 남아야 한다.
--
-- ── per_m2_krw ──────────────────────────────────────────────────────────
-- 총액 ÷ 관리비부과면적(apartment_complexes.metadata.manageAreaM2 — 1024 부터 상세 보강이 채운다).
-- 면적을 모르면 null. 화면은 null 을 "—" 로 낸다(지어내지 않음).
--
-- ── 후보 뷰 ──────────────────────────────────────────────────────────────
-- 수도권(11·41·28) 대장 중 "실거래가 있는 단지 우선" 을 PostgREST 한 번으로 고르기 위한 뷰.
-- has_tx = market_agg.complex_master_link(1006) 에 그 kapt_code 가 연결돼 있는가.
-- mgmt_fee_ym = 마지막으로 시도한 달(metadata.mgmtFeeYm) — 적재가 커서로 쓴다.
-- security_invoker 이므로 service_role 의 권한으로 밑단(market_agg.complex_master_link 는 service_role SELECT)을 읽는다.
-- anon/authenticated 에는 어느 것도 열지 않는다.

create table if not exists public.complex_mgmt_fee (
  kapt_code      text        not null,
  -- 부과 월 YYYYMM
  ym             text        not null check (ym ~ '^[0-9]{6}$'),
  -- 공용관리비 합(원). API 가 그 달 공용관리비를 안 주면 null
  common_krw     bigint      check (common_krw is null or common_krw >= 0),
  -- 개별사용료 합(원). 없으면 null
  individual_krw bigint      check (individual_krw is null or individual_krw >= 0),
  -- 총액(원) = coalesce(공용,0) + coalesce(개별,0). 둘 다 null 이면 행을 만들지 않는다(적재 규칙)
  total_krw      bigint      not null check (total_krw >= 0),
  -- 관리비부과면적 ㎡당 총액(원). 면적을 모르면 null
  per_m2_krw     integer     check (per_m2_krw is null or per_m2_krw >= 0),
  source         text        not null default 'k-apt',
  fetched_at     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  constraint complex_mgmt_fee_pkey primary key (kapt_code, ym)
);

-- 단지 상세는 "한 단지의 최근 12개월"을 읽는다 — PK (kapt_code, ym) 가 그대로 그 순서다. 추가 인덱스 없음.

comment on table public.complex_mgmt_fee is
  'K-apt 공동주택 관리비(공용관리비+개별사용료) 월별 총액. 키 (kapt_code=apartment_complexes.external_id, ym). 적재: kapt-mgmt-fee-ingest 크론. 읽기: lib/complex/mgmt-fee.ts.';

alter table public.complex_mgmt_fee enable row level security;
revoke all on public.complex_mgmt_fee from anon, authenticated;
grant all on public.complex_mgmt_fee to service_role;

-- ── 관리비 적재 후보 뷰 ─────────────────────────────────────────────────
create or replace view public.kapt_mgmt_fee_candidates
with (security_invoker = on) as
select a.external_id                                   as kapt_code,
       a.name,
       a.address,
       a.lawd_cd,
       exists (
         select 1 from market_agg.complex_master_link l
         where l.kapt_code = a.external_id
       )                                               as has_tx,
       nullif(a.metadata ->> 'mgmtFeeYm', '')          as mgmt_fee_ym,
       case when (a.metadata ->> 'manageAreaM2') ~ '^[0-9]+(\.[0-9]+)?$'
            then (a.metadata ->> 'manageAreaM2')::numeric
       end                                             as manage_area_m2
from public.apartment_complexes a
where a.source_key = 'k-apt-basic'
  and a.external_id is not null
  and left(a.lawd_cd, 2) in ('11', '41', '28');

comment on view public.kapt_mgmt_fee_candidates is
  '[1024] 관리비 적재 후보(수도권 K-apt 대장). has_tx = 실거래 단지 연결(complex_master_link) 여부, mgmt_fee_ym = 마지막 시도 달(커서).';

revoke all on public.kapt_mgmt_fee_candidates from anon, authenticated;
grant select on public.kapt_mgmt_fee_candidates to service_role;