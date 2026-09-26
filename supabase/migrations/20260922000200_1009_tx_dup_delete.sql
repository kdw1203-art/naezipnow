-- [1009] 2026-07 실거래 이중 적재 정리 — 2단계: 백업(ops.tx_dup_rollback_20260922, 매매 2,163 · 전월세 6,302 = 8,465행 ·
-- 34개 시군구 · 전부 옛 경로 키 · 전부 202607 — 적용 직후 읽기 전용으로 확인)에 담긴 옛 경로 사본만 지운다.
-- 같은 거래의 molit-cron 행은 그대로 남는다. 되돌리기는 1단계 파일 머리 주석 참고. 소유자 승인 2026-09-22.
set local statement_timeout = '180s';

delete from public.market_transactions t
using ops.tx_dup_rollback_20260922 b
where t.id = b.id
  and t.external_key not like 'molit-cron:%'
  and t.contract_ym = '202607';
