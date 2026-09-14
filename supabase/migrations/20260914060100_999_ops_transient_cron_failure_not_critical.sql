-- [999] 헬스체크 오탐 둘 — 1회짜리 일시 실패가 critical 을 울리던 규칙을 고친다.
--
-- 실측(2026-09-14, cron.job_run_details 7일): 실패는 09-13 23:30 UTC 단 한 번, 잡 24·25 가 동시에
-- "job startup timeout"(pg_cron 스케줄러 쪽 지연) — 둘 다 00:30 회차에 정상 복귀. 그런데
--   · ops.cron_job_failure_check(매시 :10) 는 00:10 에 "이후 성공 없음(중단 상태)" critical 을 적었다.
--     다음 회차(00:30)가 아직 안 온 것뿐인데 "중단"으로 판정 — 7일간 critical 26건의 대부분이 이 모양.
--   · ops.watchdog_self_check(매시 :50) 는 "최근 6시간 실패 1회"만으로 6시간 내내 critical(12건) —
--     마지막 성공이 20분 전인데도 "헬스체크가 신뢰 불가 상태"라고 했다.
-- 운영자 인박스에도 같은 문구가 갔다. 조치할 게 없는 critical 은 진짜 critical 을 묻는다.
--
-- 새 규칙
--   cron_job_failure_check: 실패 뒤 아직 성공이 없더라도
--     - 마지막 성공 이후 실패가 2회 이상(연속 실패) → critical
--     - 잡 주기가 12시간 이상(일·주 단위 잡: 다음 기회가 멀다) → critical
--     - 마지막 실패로부터 주기+15분이 지났는데도 성공이 없다(다음 회차가 오지 않았다) → critical
--     - 그 밖(시간 단위 잡의 1회 실패, 다음 회차 전) → warn "재시도 대기"
--     주기는 최근 7일 실행 간격의 최솟값(스케줄 문자열 해석 없이 사실에서 도출).
--   watchdog_self_check:
--     - 마지막 성공이 없거나 3시간을 넘김 → critical (감시 잡이 실제로 멈춤)
--     - 최근 6시간 실패 2회 이상(성공은 있음) → warn
--     - 1회 실패 뒤 정상 복귀 → 기록 없음
--
-- 되돌리기: 20260827224626 ops_cron_job_failure_check_ignore_inflight_runs_20260828 ·
--           20260816224203 ops_watchdog_self_check_and_resilient_record_health_alerts 의 정의로 create or replace.

create or replace function ops.cron_job_failure_check()
returns integer
language plpgsql
security definer
set search_path to 'ops', 'public', 'pg_catalog'
as $$
declare
  owner_emails text[] := array['kdw1203@gmail.com','nuguzip@naver.com'];
  em text; r record; hits int := 0; worst text := null; sev text; msg text; tag text; why text;
  cadence interval; fails_after_ok int;
begin
  for r in
    select j.jobid, j.jobname,
           count(*) filter (where d.status <> 'succeeded')                      as fails,
           max(d.start_time) filter (where d.status <> 'succeeded')             as last_fail,
           max(d.start_time) filter (where d.status = 'succeeded')              as last_ok,
           (array_agg(d.return_message order by d.start_time desc)
              filter (where d.status <> 'succeeded'))[1]                        as last_msg
    from cron.job j
    join cron.job_run_details d on d.jobid = j.jobid
    where j.active
      and d.start_time > now() - interval '24 hours'
      -- 진행 중인 실행은 판정하지 않는다. 완료된 실행만 성공/실패를 말할 수 있다.
      and d.end_time is not null
      and d.status <> 'running'
    group by j.jobid, j.jobname
    having count(*) filter (where d.status <> 'succeeded') > 0
    order by j.jobid
  loop
    tag := format('cron %s(%s) ', r.jobname, r.jobid);

    if r.last_ok is not null and r.last_ok > r.last_fail then
      sev := 'warn';
      why := '이후 성공으로 회복';
    else
      -- 마지막 성공 이후(성공이 없으면 24시간 창 전체) 실패 횟수
      select count(*) into fails_after_ok
        from cron.job_run_details d
       where d.jobid = r.jobid
         and d.status not in ('succeeded','running')
         and d.end_time is not null
         and d.start_time > coalesce(r.last_ok, now() - interval '24 hours');

      -- 잡 주기 = 최근 7일 실행 시작 간격의 최솟값(실행이 1건뿐이면 null → 주기 긴 잡으로 본다)
      select min(gap) into cadence
        from (select d.start_time - lag(d.start_time) over (order by d.start_time) as gap
                from cron.job_run_details d
               where d.jobid = r.jobid and d.start_time > now() - interval '7 days') g
       where gap is not null and gap > interval '30 seconds';

      if fails_after_ok >= 2 then
        sev := 'critical';
        why := format('이후 성공 없음 · 연속 %s회 실패(중단 상태)', fails_after_ok);
      elsif cadence is null or cadence >= interval '12 hours' then
        sev := 'critical';
        why := '이후 성공 없음 · 일·주 단위 잡이라 다음 기회가 멀다(중단 상태)';
      elsif now() - r.last_fail > cadence + interval '15 minutes' then
        sev := 'critical';
        why := format('이후 성공 없음 · 다음 회차(주기 %s)가 지났는데 실행 기록이 없다(중단 상태)',
                      to_char(cadence, 'HH24:MI'));
      else
        sev := 'warn';
        why := format('1회 실패 · 다음 회차(%s 뒤) 재시도 대기 — 연속 실패면 critical 로 올라간다',
                      to_char(greatest(cadence - (now() - r.last_fail), interval '0'), 'HH24:MI'));
      end if;
    end if;

    msg := format('%s최근 24시간 실패 %s건 · 마지막 실패 %s · %s · 사유: %s',
                  tag, r.fails,
                  to_char(r.last_fail at time zone 'Asia/Seoul','MM-DD HH24:MI'),
                  why,
                  left(replace(coalesce(r.last_msg,'(사유 미기록)'), E'\n', ' '), 160));

    if sev = 'critical' and worst is null then worst := msg; end if;

    -- 스로틀: 같은 잡·같은 심각도가 최근 6시간 안에 이미 기록됐으면 재기록하지 않는다.
    if exists (
      select 1 from ops.health_alert_log l
       where l.check_name = 'ops.cron_job'
         and l.severity   = sev
         and l.detail like tag || '%'
         and l.checked_at > now() - interval '6 hours'
    ) then
      continue;
    end if;

    insert into ops.health_alert_log(check_name, severity, detail, age_hours)
    values ('ops.cron_job', sev, msg,
            round((extract(epoch from (now() - r.last_fail))/3600.0)::numeric, 1));
    hits := hits + 1;
  end loop;

  if worst is not null and not exists (
      select 1 from public.user_inbox_notifications
       where body like '[HEALTH] ops.cron_job%' and created_at > now() - interval '20 hours') then
    foreach em in array owner_emails loop
      insert into public.user_inbox_notifications(user_email, title, body, action_url)
      values (em, '크론 잡 중단 감지', '[HEALTH] ops.cron_job — ' || worst, '/admin');
    end loop;
  end if;

  return hits;
end
$$;

revoke all on function ops.cron_job_failure_check() from public, anon, authenticated;

create or replace function ops.watchdog_self_check()
returns integer
language plpgsql
security definer
set search_path to 'public', 'ops', 'cron'
as $$
declare
  owner_emails text[] := array['kdw1203@gmail.com','nuguzip@naver.com'];
  em text;
  j record;
  hits integer := 0;
  msg text;
  sev text;
begin
  -- 감시 대상: 헬스체크 파이프라인의 코어 잡들.
  for j in
    select job.jobid, job.jobname,
           max(d.end_time) filter (where d.status = 'succeeded') as last_ok,
           count(*) filter (where d.status = 'failed' and d.start_time > now() - interval '6 hours') as recent_fails
    from cron.job job
    left join cron.job_run_details d on d.jobid = job.jobid
    where job.active and job.jobname in ('etl-freshness-watchdog-hourly','site-probe-hourly')
    group by job.jobid, job.jobname
  loop
    sev := null;
    if j.last_ok is null or now() - j.last_ok > interval '3 hours' then
      -- 마지막 성공이 세 회차 넘게 없다 — 감시가 실제로 멈췄다.
      sev := 'critical';
      msg := format('%s (jobid=%s) 마지막 성공 %s · 최근 6시간 실패 %s회 — 감시 잡이 멈춤: 헬스체크가 신뢰 불가 상태',
                    j.jobname, j.jobid,
                    coalesce(to_char(j.last_ok at time zone 'Asia/Seoul','MM-DD HH24:MI'), '없음'),
                    j.recent_fails);
    elsif j.recent_fails >= 2 then
      -- 성공은 이어지지만 실패가 잦다 — 스케줄러 지연·타임아웃 반복 여부를 볼 것.
      sev := 'warn';
      msg := format('%s (jobid=%s) 마지막 성공 %s · 최근 6시간 실패 %s회 — 회복은 되지만 실패가 잦다(스케줄러 지연·타임아웃 확인)',
                    j.jobname, j.jobid,
                    to_char(j.last_ok at time zone 'Asia/Seoul','MM-DD HH24:MI'),
                    j.recent_fails);
    end if;
    -- 1회 실패 뒤 정상 복귀는 기록하지 않는다(조치할 것이 없다).

    if sev is not null then
      insert into ops.health_alert_log (check_name, severity, detail, age_hours)
      values ('ops.watchdog_self', sev, msg,
              round((extract(epoch from (now() - j.last_ok))/3600.0)::numeric, 1));
      hits := hits + 1;

      if sev = 'critical' and not exists (
        select 1 from public.user_inbox_notifications
        where body like '[HEALTH] ops.watchdog_self%' || j.jobname || '%'
          and created_at > now() - interval '6 hours'
      ) then
        foreach em in array owner_emails loop
          insert into public.user_inbox_notifications (user_email, title, body, action_url)
          values (em, '감시 잡 중단 · ' || j.jobname,
                  '[HEALTH] ops.watchdog_self — ' || msg, '/admin/ops');
        end loop;
      end if;
    end if;
  end loop;

  return hits;
end;
$$;

revoke all on function ops.watchdog_self_check() from public, anon, authenticated;
