/* 1006 · 설정 화면의 표시·기록 기본값 저장 칸.
   (MCP apply_migration 으로 적용한 원문 그대로. 원장 version 20260920032000)

   user_preferences 는 페르소나·우선순위(개인화 가중)만 담고 있었다(2026-09-20 실측 0행,
   service_role 전용, 정책 없음). 설정 화면이 새로 갖는 값 — 면적 단위(㎡/평), 임장노트
   기본 공개 범위·기본 투자자 역할·퀵 기록 기본, 주간 다이제스트 수신 — 은 열을 늘리지
   않고 jsonb 한 칸에 둔다. 스키마는 lib/prefs/ui-prefs.ts(순수·테스트)가 정하고, 서버가
   읽을 때마다 정규화한다(모르는 키는 버린다). 권한은 표의 기존 ACL 그대로(service_role
   전용) — 새로 여는 것 없음. */

alter table public.user_preferences
  add column if not exists ui_prefs jsonb not null default '{}'::jsonb;
