-- [1139] 지역 월 집계(market_region_monthly)가 새 프로젝트에서 비어 있었다 — 일일 집계(refresh_market_aggregates)에 이 단계가 없고
-- 주 1회 전체 재구축(일요일)만 있어, 첫 일요일 전까지 "거래량 자료 없음"이었다.
--   · 매일 23:20 UTC(08:20 KST): 최근 4개월(신고 지연 30~60일 반영) — 일일 집계(23:00) 뒤
--   · 지금 한 번: 25개월 전체
select cron.unschedule(jobid) from cron.job where jobname = 'market-region-monthly-daily';
select cron.schedule(
  'market-region-monthly-daily',
  '20 23 * * *',
  $$ set local statement_timeout = '600s'; select public.refresh_market_region_monthly(4); $$
);
set statement_timeout = '1800s';
select public.refresh_market_region_monthly(25);
reset statement_timeout;
