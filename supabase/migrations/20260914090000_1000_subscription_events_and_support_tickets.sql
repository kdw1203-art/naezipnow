-- [1000] 결제 고도화 · 고객센터 — 구독 이력/해지 사유/사전 통지 표식 + 1:1 문의 티켓.
--
-- 왜
--   · billing_subscriptions 는 "지금 상태"만 있고 이력이 없다 — 언제 등록·갱신·실패·해지됐는지 화면에서
--     보여 줄 수 없고, 해지 API 는 본문을 읽지 않아 사유도 안 남는다(2026-09-14 실측).
--   · 정기결제 청구 사전 통지(전자상거래법 시행령 제30조의2 취지)를 보내려면 "이 회차에 통지했다"는
--     표식이 필요하다 — notice_sent_for = 통지한 next_charge_at.
--   · /api/support 는 인박스 알림 + 메일만 보내고 어디에도 저장하지 않아 "내 문의 내역"을 만들 수 없었다.
--
-- 권한: 두 테이블 모두 RLS 켜고 정책 0개 = 서비스롤 전용(billing_subscriptions 와 같은 모양).
--       anon·authenticated 는 명시적으로 revoke(기본권한이 열어 둔 구멍 예방). GRANT 는 없다.
--
-- 되돌리기:
--   drop table public.support_tickets; drop table public.subscription_events;
--   alter table public.billing_subscriptions drop column cancel_reason, drop column cancel_note, drop column notice_sent_for;

alter table public.billing_subscriptions
  add column if not exists cancel_reason text,
  add column if not exists cancel_note text,
  add column if not exists notice_sent_for timestamptz;

comment on column public.billing_subscriptions.cancel_reason is '[1000] 해지 사유 코드(too_expensive|not_using|missing_feature|switching|other)';
comment on column public.billing_subscriptions.cancel_note is '[1000] 해지 자유 의견(≤500자)';
comment on column public.billing_subscriptions.notice_sent_for is '[1000] 청구 사전 통지를 보낸 회차의 next_charge_at — 같은 값이면 다시 보내지 않는다';

create table if not exists public.subscription_events (
  id              bigint generated always as identity primary key,
  subscription_id uuid references public.billing_subscriptions(id) on delete set null,
  user_email      text not null,
  event           text not null check (event in (
                    'enrolled','activated','renewed','renewal_failed','suspended',
                    'card_changed','canceled','deleted','notice_sent','reactivated')),
  detail          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists subscription_events_user_created_idx
  on public.subscription_events (user_email, created_at desc);
alter table public.subscription_events enable row level security;
revoke all on table public.subscription_events from anon, authenticated;
comment on table public.subscription_events is '[1000] 자동결제 구독 이력(서비스롤 전용) — /my/subscription 타임라인';

create table if not exists public.support_tickets (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  user_email    text,
  contact_email text not null,
  category      text not null,
  subject       text not null,
  message       text not null,
  status        text not null default 'open' check (status in ('open','answered','closed')),
  admin_reply   text,
  replied_at    timestamptz,
  replied_by    text,
  metadata      jsonb not null default '{}'::jsonb
);
create index if not exists support_tickets_user_created_idx
  on public.support_tickets (user_email, created_at desc);
create index if not exists support_tickets_status_created_idx
  on public.support_tickets (status, created_at desc);
alter table public.support_tickets enable row level security;
revoke all on table public.support_tickets from anon, authenticated;
comment on table public.support_tickets is '[1000] 1:1 문의 티켓(서비스롤 전용) — /my/support · /admin/support';
