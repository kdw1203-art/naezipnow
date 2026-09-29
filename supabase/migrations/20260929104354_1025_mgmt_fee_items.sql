-- [1025] complex_mgmt_fee 에 항목별 금액 jsonb `items` 추가. 추가 전용 · 지우는 것 없음 · 재실행 안전.
--
-- ── 왜 ──────────────────────────────────────────────────────────────────
-- K-apt 관리비 API 는 오퍼레이션이 22개(공용관리비 17 + 개별사용료 5)라 단지·월 총액을 만들려면 22회를 부른다.
-- 총액만 남기면 "경비비가 얼마인지"·"난방비가 왜 늘었는지" 를 다시 22회 불러야 알 수 있다. 부른 김에 항목별 금액을
-- 한 열에 같이 둔다. 쓰는 곳: lib/national-data/kapt-mgmt-fee-ingest.ts(쓰기 — 열이 없으면 이 열만 빼고 적재).
-- 읽기(lib/complex/mgmt-fee.ts)는 아직 총액만 읽는다 — 화면 항목 분해는 다음 브리프.
--
-- ── 모양 ────────────────────────────────────────────────────────────────
-- { "labor": 12345678, "taxdue": 234567, …, "heat": null, … } — 키는 kapt-mgmt-fee-api.ts 의 MgmtFeeOpSpec.key(22개),
-- 값은 원 단위 정수, 그 달 응답이 없던 항목은 null. 조건절에 쓰지 않는 열이므로 통계는 0 (README 규칙 5).

alter table public.complex_mgmt_fee
  add column if not exists items jsonb;

alter table public.complex_mgmt_fee
  alter column items set statistics 0;

comment on column public.complex_mgmt_fee.items is
  '[1025] 항목별 금액(원). 키 = kapt-mgmt-fee-api MgmtFeeOpSpec.key(공용 17 · 개별 5), 응답 없는 항목은 null. 조건절에 쓰지 않음(statistics 0).';

-- 권한은 표에 이미 걸린 것 그대로(anon/authenticated 없음 · service_role 전부). 새로 여는 것 없음.

-- ── [1025 · #8] 해제 신고 매매 행 인덱스 ────────────────────────────────────
-- 단지 상세 최근 실거래 표가 해제 신고 행(is_cancelled = true)을 취소선으로 보인다(complex-store getComplexDeals
-- includeCancelled). 단지별 매매 인덱스(mt_trade_complex_cov2_idx · mt_trade_complex_cov_idx)는 전부
-- `is_cancelled = false` 부분 인덱스라 해제 행 조회는 타지 못한다. 해제 행은 전체 12,725건(2026-09-29 실측)이라
-- 부분 인덱스 하나면 작다. 조회 모양: region_name = ? and complex_name = ? and transaction_type = 'trade'
-- and property_type = 'apartment' and is_cancelled = true order by contract_ym desc limit 200.
-- 인덱스는 GRANT 대상이 아니다 — 새 권한 없음. CONCURRENTLY 는 트랜잭션 안에서 못 쓰므로 붙이지 않는다(행 수가 작아 잠금 짧음).
create index if not exists mt_trade_complex_cancelled_idx
  on public.market_transactions (region_name, complex_name, contract_ym desc)
  include (contract_day, deal_amount_krw, area_m2, floor, property_type)
  where transaction_type = 'trade' and is_cancelled = true;