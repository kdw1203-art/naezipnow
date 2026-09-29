-- [1025 · 결정·비서] 결정 카드(/decide) 저장 표. 추가 전용 · 지우는 것 없음. (통합자 적용 — 파일만)
--
-- ── 왜 ──────────────────────────────────────────────────────────────────
-- 후보(최대 3곳)·가중치·1순위·결정(살까/보류/패스/다시 보기)·메모 한 줄을 한 행으로 남긴다.
-- 쓰는 곳: lib/decide/decisions-store.ts(읽기·쓰기), 라우트 app/api/me/decisions(GET/POST).
-- 게스트는 이 표를 쓰지 않는다(localStorage nz:decisions:v1).
--
-- ── 키 ──────────────────────────────────────────────────────────────────
-- 브리프는 user_id uuid 를 적었지만 이 앱의 세션 id 는 provider 별 문자열(kakao:… · 이메일)이라 uuid 가 아니다
-- (auth.ts session 콜백). 다른 개인 표(user_watchlist · user_preferences · inspection_schedules · notification_preferences)
-- 와 같은 user_email text 로 둔다 — 그래야 라우트가 세션에서 바로 쓸 수 있다.
-- chosen_name 은 "지난 결정" 목록이 단지 이름을 다시 조회하지 않고 그리기 위한 저장 시점 이름(표시용).
--
-- ── 권한 ────────────────────────────────────────────────────────────────
-- RLS 켜짐 · 정책 없음 · service_role 전용(다른 개인 표와 같다). anon/authenticated 에는 아무것도 열지 않는다.

create table if not exists public.user_decisions (
  id          uuid        primary key default gen_random_uuid(),
  user_email  text        not null,
  complex_ids text[]      not null check (cardinality(complex_ids) between 1 and 3),
  chosen_id   text,
  chosen_name text,
  verdict     text        not null check (verdict in ('buy', 'hold', 'pass', 'revisit')),
  memo        text        check (memo is null or char_length(memo) <= 200),
  weights     jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- "내 결정 최근 30건" 을 읽는다 — (user_email, created_at desc)
create index if not exists user_decisions_user_created_idx
  on public.user_decisions (user_email, created_at desc);

comment on table public.user_decisions is
  '[1025] 결정 카드(/decide) 기록 — 후보 단지 id 배열·가중치·1순위·결정(buy/hold/pass/revisit)·메모. 키 user_email. service_role 전용.';

alter table public.user_decisions enable row level security;
revoke all on public.user_decisions from anon, authenticated;
grant all on public.user_decisions to service_role;