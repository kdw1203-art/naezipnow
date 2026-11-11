-- [1147] 관리자 2단계 인증(TOTP) — 암호화한 비밀값 · 켬 여부. 서버(service_role)만 읽고 쓴다. (2026-11-11 운영 반영 완료 · 이 파일은 기록)
-- 인증 앱을 잃어버렸을 때: delete from public.admin_totp where email = '<관리자 이메일>'; 로 지우면 다시 등록할 수 있다.
create table if not exists public.admin_totp (
  email text primary key,
  secret_sealed text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  last_used_at timestamptz
);
alter table public.admin_totp enable row level security;
revoke all on public.admin_totp from anon, authenticated;
grant all on public.admin_totp to service_role;
