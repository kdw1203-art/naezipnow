-- [새 프로젝트 보충 4] 함수 실행 권한 잠금 — 사이트는 서버에서 service_role 로만 DB 를 부른다(브라우저는 비밀번호 재설정 인증만).
-- 운영의 권한 정리 마이그레이션 일부는 저장소 밖 객체를 전제로 해 건너뛰었으므로, 끝에서 한 번에 닫는다.
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private','ops','reporting','market_agg') and p.prokind = 'f' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
grant usage on schema private, ops, reporting, market_agg to service_role;
grant select on all tables in schema market_agg, reporting to service_role;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
