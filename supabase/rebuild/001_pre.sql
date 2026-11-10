-- [새 프로젝트 기준 구조 보충] 2026-07-24 이후 운영에만 적용되고 저장소에 정의가 없는 바탕(스키마 · 관리자 판정 함수)
create schema if not exists private;
create schema if not exists ops;
create schema if not exists reporting;
create schema if not exists market_agg;
grant usage on schema market_agg, reporting to service_role;
-- 관리자 판정: 요청 토큰의 이메일이 app_users 의 관리자 계정인지(추정 구현 — 운영 원문 없음)
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.app_users u where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and u.role in ('admin', 'owner', 'superadmin'))
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public, pg_temp as $$ select private.is_admin() $$;
create or replace function public.is_admin_request() returns boolean language sql stable security definer set search_path = public, pg_temp as $$ select private.is_admin() $$;
create or replace function private.is_admin_request() returns boolean language sql stable security definer set search_path = public, pg_temp as $$ select private.is_admin() $$;
