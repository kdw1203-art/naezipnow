-- [1191] 운영 경보 "7일 성공 0 · skipped N건 — 수집이 한 번도 성공하지 않음" 에 마지막 건너뜀 사유를 붙인다.
-- 예: "NAVER_SEARCH_CLIENT_ID 미설정", "활용신청 필요(HTTP 403)" — 경보만 보고 무엇을 하면 되는지 알 수 있게.
-- 함수 본문을 통째로 다시 쓰지 않고, 현재 정의에서 두 군데만 바꿔 다시 만든다(다른 부분은 그대로).
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('ops.ingest_no_success_check'::regproc);
  if position('last_sk_msg' in d) > 0 then
    raise notice '이미 적용됨';
    return;
  end if;
  n := replace(d,
    $a$(array_agg(left(message, 160) order by created_at desc) filter (where status = 'error'))[1] as last_err_msg$a$,
    $b$(array_agg(left(message, 160) order by created_at desc) filter (where status = 'error'))[1] as last_err_msg,
               (array_agg(left(message, 120) order by created_at desc) filter (where status = 'skipped'))[1] as last_sk_msg$b$);
  n := replace(n,
    $a$v_msg := format('7일 성공 0 · skipped %s건 — 수집이 한 번도 성공하지 않음', r.sk7);$a$,
    $b$v_msg := format('7일 성공 0 · skipped %s건 · 사유: %s', r.sk7, coalesce(r.last_sk_msg, '(미기록)'));$b$);
  if n = d or position('last_sk_msg' in n) = 0 or position('r.last_sk_msg' in n) = 0 then
    raise exception '함수 정의가 예상과 달라 바꾸지 않음';
  end if;
  execute n;
end $$;

-- 확인(읽기만): 경보에 붙을 사유 미리 보기
select ops.ingest_no_success_check(true);
