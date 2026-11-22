-- [1208] 새 DB(2026-11-10)에 실거래 적재 시각 색인이 없었다 — 신고가 탐지(lib/market/price-highs readFreshGroups)의
-- "최근 26시간 새 매매" 조회가 mt_trade_region_recent_cov2_idx 를 계약월로 훑어 41,195행을 버리며 9.05초(디스크 22,525블록) →
-- statement timeout(운영 경보 ops.ingest:news · 신고가 탐지 실패). 적재 시각 부분 색인으로 최근 행만 읽는다.
create index if not exists mt_trade_apt_created_idx
  on public.market_transactions (created_at desc)
  include (deal_amount_krw, area_m2, complex_name, region_name, contract_ym, contract_day)
  where transaction_type = 'trade' and property_type = 'apartment' and is_cancelled = false;
