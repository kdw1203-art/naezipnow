-- [1201] market-agg-smoketest(jobid 12) 이 11-19 부터 매일 2분에서 끊겼다.
-- 원인: 서버 기본 statement_timeout(2분). 함수의 SET statement_timeout '900s' 는
-- 이미 시작된 문장의 타이머를 늘리지 못한다 — 실행 시간이 40초 → 118초로 늘어 2분을 넘었다.
-- 다른 두 잡(6·13)처럼 명령 자체에서 set local 로 올린다. (운영 DB 에는 2026-11-21 적용됨)
select cron.alter_job(
  (select jobid from cron.job where jobname = 'market-agg-smoketest'),
  command := $c$ set local statement_timeout = '900s'; select public.refresh_market_aggregates_cron(); $c$
);
