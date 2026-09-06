-- [967 · 28] pg_cron 'billing-renewals'(jobid 30) 해제 — 경보 소음 제거.
--
-- 실측(2026-09-06, ops.health_alert_log): 최근 48시간 critical 55건 중 48건이
-- cron.billing-renewals, 7건이 ops.cron_job(같은 잡의 실패 보고). 원인은 하나 —
-- ops.run_billing_renewals() 가 vault 시크릿 cron_secret 부재로 매 실행마다
-- 큰 소리로 실패한다(20260826040000 의 의도된 동작). 그 사이 실제 갱신은
-- vercel.json 크론이 같은 시각(01:10·13:10 UTC)에 돌리고 있고 매번 200 으로
-- 끝난다(Vercel 런타임 로그 09-05 13:10 GET /api/cron/billing-renewals 200).
--
-- 즉 이 pg_cron 잡은 "돌 수 없는 2차 경로" 인데 1차 경로가 멀쩡한 동안 매일
-- 경보 24건을 만들어 진짜 경보를 묻는다. 잡만 해제한다 — 함수 ops.run_billing_renewals
-- 는 그대로 둔다(권한 변경 없음). 소유자가 vault 에 cron_secret 을 등록한 뒤
-- 2차 경로를 되살리려면:
--   select cron.schedule('billing-renewals', '10 1,13 * * *', 'select ops.run_billing_renewals()');
--
-- 멱등: 잡이 없으면 아무 일도 하지 않는다.

do $$
declare
  jid bigint;
begin
  for jid in select jobid from cron.job where jobname = 'billing-renewals' loop
    perform cron.unschedule(jid);
  end loop;
end $$;
