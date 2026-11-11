-- [1145] 관리자 상태판의 DB 용량 — 전체 크기와 큰 표 5개. 서버(service_role)만 부른다. 여러 번 돌려도 안전.
create or replace function public.admin_db_stats()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('name', t.name, 'bytes', t.bytes) order by t.bytes desc)
      from (
        select c.relname as name, pg_total_relation_size(c.oid) as bytes
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'm')
        order by pg_total_relation_size(c.oid) desc
        limit 5
      ) t
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.admin_db_stats() from public, anon, authenticated;
grant execute on function public.admin_db_stats() to service_role;
