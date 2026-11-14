-- [1181] pg_cron 'billing-renewals' 해제 — 운영 경보(ops.cron_job critical) 원인 제거.
-- 자동결제 갱신은 Vercel 크론(vercel.json · 10 1,13 * * *)이 같은 시각에 부른다.
-- pg_cron 쪽은 vault 시크릿(cron_secret)이 없어 매번 실패만 남겼다. 같은 일을 두 곳이 부를 이유가 없다.
-- 되돌리기: select cron.schedule('billing-renewals', '10 1,13 * * *', 'select ops.run_billing_renewals()');
do $$
declare jid bigint;
begin
  for jid in select jobid from cron.job where jobname = 'billing-renewals' loop
    perform cron.unschedule(jid);
  end loop;
end $$;

select count(*) as remaining from cron.job where jobname = 'billing-renewals';
