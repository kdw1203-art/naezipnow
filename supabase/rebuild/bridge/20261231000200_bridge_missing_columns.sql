-- [새 프로젝트 보충 5] 코드가 읽고 쓰는데 기준 구조(2026-07-24) 뒤 저장소 밖에서 추가된 열 넷
alter table public.app_users add column if not exists plan_expires_at timestamptz;
create index if not exists app_users_plan_expiry_idx on public.app_users (plan_expires_at) where plan_expires_at is not null;
alter table public.user_inbox_notifications add column if not exists channel text not null default 'user';
alter table public.user_watchlist add column if not exists last_price_band text;
alter table public.dev_partners add column if not exists contact_masked text;
