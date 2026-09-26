/* 1008 · J — 내 집 마련 여정(/journey · /journey/contract) 진행 저장 칸. [적용됨 2026-09-21 — apply_migration '1008_user_preferences_journey_state']

   무엇을: 로그인 사용자의 여정 진행(단계별 "다 했어요" 체크 시각 + 계약·잔금 일정표의 날짜·체크)을
   jsonb 한 칸에 둔다. 스키마·정규화·크기 상한(정규화 뒤 4KB)은 lib/journey/state.ts(순수·테스트)가 정하고,
   서버(lib/journey/store.ts)가 읽고 쓸 때마다 normalizeJourneyState 를 거친다 — 모르는 키는 버린다.

   왜 user_preferences 인가: 1006 의 ui_prefs 와 같은 "사용자당 한 행" 표이고(2026-09-21 실측 0행),
   권한이 이미 service_role 전용(RLS 켜짐 · 정책 0개 · anon/authenticated 권한 없음)이다. 새 표를 만들면
   권한·RLS 를 다시 세워야 하지만 칸 하나는 기존 ACL 을 그대로 물려받는다 — 새로 여는 것 없음(GRANT 없음).

   비용: 상수 기본값이 있는 칸 추가는 PG 11+ 에서 메타데이터 변경뿐이다(표 재작성 없음, 0행).
   적용 전에는 GET/PUT /api/me/journey 가 42703(칸 없음)으로 500 을 내고, 화면은 이 기기 저장으로 동작한다. */

alter table public.user_preferences
  add column if not exists journey_state jsonb not null default '{}'::jsonb;
