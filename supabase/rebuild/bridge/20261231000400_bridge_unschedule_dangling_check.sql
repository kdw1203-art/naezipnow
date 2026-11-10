-- [새 프로젝트 보충 7] 매시간 실패하는 감시 예약을 끈다(건너뛴 ops 객체를 가리키는 함수를 찾아 오류를 내는 점검 — 새 구조에서는 늘 실패한다)
select cron.unschedule(jobid) from cron.job where jobname = 'dangling-relation-check-hourly';
