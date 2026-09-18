/* [1003] 폐기한 수집 소스는 침묵 경보를 내지 않는다 — 다시 돌기 시작하면 즉시 되돌아온다.
   운영 경보 화면에 매일 뜨던 critical:
     ingest 소스 "court-auction" 마지막 실행 09-13 19:51 (95.1h 전) — 관측 주기 23.67h …
   court-auction 은 [993] 에서 ETL 호출을 뺐다. lib/court-auction/sync.ts 가 아직 fetch 없는
   스텁이라 46회 실행 동안 ok 적재가 0건이었기 때문이다. 즉 "고칠 것이 없는 경보"였고,
   경보가 매일 하나 켜져 있으면 진짜 경보가 그 옆에서 묻힌다.
   ops.ingest_source_roster.retired_at 컬럼은 처음부터 있었지만 스캔이 읽지 않았다 — 그 구멍을 막는다.
   되살아남 조건: retired_at 이후에 새 실행 로그가 생기면 다시 감시 대상이 된다
   (조용히 영구 제외하면, 나중에 진짜로 멈춘 것을 놓친다).

   적용: Supabase MCP apply_migration "1003_ops_ingest_scan_honors_retired_sources" (2026-09-17). */
create or replace function ops.ingest_source_scan(p_as_of timestamp with time zone default now())
 returns table(source text, state text, severity text, detail text)
 language sql
 stable security definer
 set search_path to 'ops', 'public', 'pg_catalog'
as $function$
with r as (
  select r.source, r.med_gap_h, r.ok_observed, r.retired_at,
         (select max(l.created_at) from public.market_ingest_log l
           where l.source = r.source and l.created_at <= p_as_of) as last_run,
         (select max(l.created_at) from public.market_ingest_log l
           where l.source = r.source and l.created_at <= p_as_of
             and (l.status='ok' or coalesce(l.rows,0)>0)) as last_ok,
         (select min(l.created_at) from public.market_ingest_log l
           where l.source = r.source and l.created_at <= p_as_of) as first_run,
         (select count(*) from public.market_ingest_log l
           where l.source = r.source and l.created_at <= p_as_of) as runs_n,
         (select count(*) from public.market_ingest_log l
           where l.source = r.source and l.created_at <= p_as_of
             and (l.status='ok' or coalesce(l.rows,0)>0)) as ok_n
  from ops.ingest_source_roster r
),
j as (
  select r.*,
         extract(epoch from (p_as_of - r.last_run))/3600.0 as silence_h,
         extract(epoch from (p_as_of - r.last_ok))/3600.0  as ok_age_h,
         greatest(r.med_gap_h * 2, r.med_gap_h + 6)  as warn_h,
         greatest(r.med_gap_h * 4, r.med_gap_h + 18) as crit_h
  from r
  where r.med_gap_h is not null
    and r.runs_n >= 5
    and p_as_of - r.first_run > interval '3 days'
    /* [1003] 폐기 표시된 소스는 제외 — 단, 폐기 이후에 다시 돈 기록이 있으면 되돌아온다 */
    and (r.retired_at is null or r.last_run > r.retired_at)
)
select j.source,
       case
         when j.silence_h > 504 then 'retired'
         when j.silence_h > j.crit_h then 'silent_crit'
         when j.silence_h > j.warn_h then 'silent_warn'
         when j.ok_n >= 3 and j.ok_age_h > j.crit_h then 'ok_drought_crit'
         when j.ok_n >= 3 and j.ok_age_h > j.warn_h then 'ok_drought_warn'
         else 'ok'
       end as state,
       case
         when j.silence_h > 504 then 'warn'
         when j.silence_h > j.crit_h then 'critical'
         when j.silence_h > j.warn_h then 'warn'
         when j.ok_n >= 3 and j.ok_age_h > j.crit_h then 'critical'
         when j.ok_n >= 3 and j.ok_age_h > j.warn_h then 'warn'
       end as severity,
       case
         when j.silence_h > 504 then
           format('ingest 소스 "%s" 가 %s일째 실행 기록 없음 — 폐기로 간주하고 이후 침묵한다. 의도한 정리가 아니면 ETL 스케줄에서 빠진 것',
                  j.source, round(j.silence_h/24.0))
         when j.silence_h > j.warn_h then
           format('ingest 소스 "%s" 마지막 실행 %s (%sh 전) — 관측 주기 %sh 기준 warn %sh/crit %sh 초과. ETL 스케줄 누락·잡 제거 여부 확인',
                  j.source,
                  to_char(j.last_run at time zone 'Asia/Seoul','MM-DD HH24:MI'),
                  round(j.silence_h,1), j.med_gap_h, round(j.warn_h), round(j.crit_h))
         else
           format('ingest 소스 "%s" 실행은 되는데 성공 적재가 %sh째 없음 (마지막 성공 %s · 마지막 실행 %s) — API 버전·키 만료 의심',
                  j.source, round(j.ok_age_h,1),
                  coalesce(to_char(j.last_ok at time zone 'Asia/Seoul','MM-DD HH24:MI'),'없음'),
                  to_char(j.last_run at time zone 'Asia/Seoul','MM-DD HH24:MI'))
       end as detail
from j;
$function$;

update ops.ingest_source_roster
   set retired_at = coalesce(retired_at, now()),
       note = '[993] ETL 호출 제거 — lib/court-auction/sync.ts 스텁(ok 적재 0건). 구현해 다시 호출하면 감시 자동 복귀',
       updated_at = now()
 where source = 'court-auction';
