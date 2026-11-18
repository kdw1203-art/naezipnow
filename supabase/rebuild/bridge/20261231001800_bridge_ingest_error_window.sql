-- [1195 기록] 2026-11-17 소유자 적용 완료. 하루 한 번 도는 수집의 오류가 24시간 창을 막 벗어나 "skipped 0건 · 사유 미기록" warn 이 생기던 것.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('ops.ingest_no_success_check'::regproc);
  if position('마지막 오류 %s · 사유' in d) > 0 then raise notice '이미 적용됨'; return; end if;
  n := replace(d, $a$if r.ok7 = 0 and r.err24 > 0 then$a$, $b$if r.ok7 = 0 and r.last_err is not null then$b$);
  n := replace(n,
    $a$v_msg := format('7일 성공 0 · 24시간 오류 %s건 · 사유: %s', r.err24, coalesce(r.last_err_msg, '(미기록)'));$a$,
    $b$v_msg := format('7일 성공 0 · 마지막 오류 %s · 사유: %s', to_char(r.last_err at time zone 'Asia/Seoul','MM-DD HH24:MI'), coalesce(r.last_err_msg, '(미기록)'));$b$);
  if n = d or position('마지막 오류 %s · 사유' in n) = 0 or position('r.last_err is not null then' in n) = 0 then
    raise exception '함수 정의가 예상과 달라 바꾸지 않음';
  end if;
  execute n;
end $$;
