-- [새 프로젝트 보충 8] 기본 정보(선택) — 연락처 · 생년월일 6자리 · 주소. 이메일 열쇠(인증 전 가입도 담는다). 서버(service_role)만 읽고 쓴다.
create table if not exists public.user_basic_info (
  email text primary key,
  phone text,
  birth_yymmdd text check (birth_yymmdd is null or birth_yymmdd ~ '^[0-9]{6}$'),
  address text check (address is null or char_length(address) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_basic_info enable row level security;
revoke all on public.user_basic_info from anon, authenticated;
grant all on public.user_basic_info to service_role;
