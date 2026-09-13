-- [993] 매일 사실 자동 갱신 — 이중 스케줄 제거 + 감시 확장 (2026-09-13)
--
-- 1) pg_cron `billing-renewals`(jobid 51) 는 20260906040337 에서 내렸다가 20260908230000 이
--    같은 시각(10 1,13 * * *)으로 다시 올렸다. 자동결제 갱신은 vercel.json 이 같은 시각에 이미
--    부르고 있어(app/api/cron/billing-renewals) 하루 두 번씩 **두 곳이 동시에** 발화했고,
--    pg_cron 쪽은 vault 시크릿 `cron_secret` 미등록으로 매번 실패 → ops.cron_job critical 경보가
--    하루 두 번 쌓였다(09-09~09-13 실측). 한 곳(Vercel)에만 둔다. 명부(cron_roster)에서는
--    은퇴 처리해 "사라진 잡" 경보가 7일간 울리지 않게 한다.
--
-- 2) ops.etl_freshness() 에 두 검사를 더한다(기존 본문은 건드리지 않고 래핑):
--    · alerts.sweep_heartbeat — GitHub Actions 에만 있는 알림 스윕(plan-expiry·points-expiry)이
--      30h 넘게 비면 warn, 50h 넘으면 critical. 08-23 처럼 GH 스케줄이 하루 통째로 빠져도
--      아무도 몰랐다 — 이제 인박스·경보 메일로 온다.
--    · ingest.apt_master_ok — apt-master 의 마지막 **성공(ok)** 을 본다. 기존 ingest.apt-master 는
--      "마지막 실행"(실패 포함)만 봐서 09-08 부터의 전면 실패(공공 API 폐기)에 ok 를 말했다.
--      (apt_master_stall_check 가 별도로 잡긴 했지만 freshness 표는 초록이었다.)
--
-- ops 스키마는 PostgREST 노출 대상이 아니다(정책). GRANT 없음.

-- ── 1) 이중 결제 갱신 크론 제거 ────────────────────────────────────────
do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'billing-renewals' limit 1;
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
end $$;

update ops.cron_roster
   set retired_at = now()
 where jobname = 'billing-renewals'
   and retired_at is null;

-- ── 2) freshness 래핑 ───────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'ops' and p.proname = 'etl_freshness_core') then
    alter function ops.etl_freshness() rename to etl_freshness_core;
  end if;
end $$;

create or replace function ops.etl_freshness_extra()
 returns table(check_name text, severity text, detail text, last_seen timestamptz, age interval)
 language sql
 stable security definer
 set search_path to 'public', 'ops'
as $function$
with
sweep as (
  select max(created_at) as last_at
  from public.market_ingest_log
  where source in ('plan-expiry', 'points-expiry')
    and created_at > now() - interval '14 days'
),
apt as (
  select max(created_at) filter (where status = 'ok') as last_ok,
         max(created_at) as last_any
  from public.market_ingest_log
  where source = 'apt-master'
    and created_at > now() - interval '30 days'
)
select 'alerts.sweep_heartbeat'::text,
       case when s.last_at is null then 'critical'
            when now() - s.last_at > interval '50 hours' then 'critical'
            when now() - s.last_at > interval '30 hours' then 'warn'
            else 'ok' end,
       format('알림 스윕(plan-expiry·points-expiry) 마지막 실행 %s (%sh 전) · GitHub Actions 06:00 UTC 일 1회 — 비면 GH 스케줄 누락',
              coalesce(to_char(s.last_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI'), '없음(14일 내)'),
              coalesce(round(extract(epoch from (now() - s.last_at))/3600.0, 1)::text, '-')),
       s.last_at, now() - s.last_at
from sweep s
union all
select 'ingest.apt_master_ok',
       case when a.last_ok is null then 'critical'
            when now() - a.last_ok > interval '7 days' then 'critical'
            when now() - a.last_ok > interval '3 days' then 'warn'
            else 'ok' end,
       format('apt-master 마지막 성공 %s · 마지막 실행 %s — 실행은 되는데 성공이 없으면 공공 API 버전·키 문제(2026-09-08 V3 폐기 전례)',
              coalesce(to_char(a.last_ok at time zone 'Asia/Seoul', 'MM-DD HH24:MI'), '없음(30일 내)'),
              coalesce(to_char(a.last_any at time zone 'Asia/Seoul', 'MM-DD HH24:MI'), '없음')),
       a.last_ok, now() - a.last_ok
from apt a
$function$;

create or replace function ops.etl_freshness()
 returns table(check_name text, severity text, detail text, last_seen timestamptz, age interval)
 language sql
 stable security definer
 set search_path to 'public', 'ops', 'cron'
as $function$
  select * from ops.etl_freshness_core()
  union all
  select * from ops.etl_freshness_extra()
$function$;

comment on function ops.etl_freshness() is
  '[993] ops.etl_freshness_core()(기존 검사 전부) + ops.etl_freshness_extra()(알림 스윕 하트비트 · apt-master 성공). 검사를 더할 때는 extra 를 고친다.';

-- 권한: revoke 만(정책 — GRANT 는 하지 않는다). pg_cron 잡은 postgres 로 실행되고,
-- 앱은 ops.* 를 PostgREST 로 부르지 않는다(admin_recent_health_alerts 가 public 래퍼).
revoke all on function ops.etl_freshness_extra() from public, anon, authenticated;
revoke all on function ops.etl_freshness() from public, anon, authenticated;
