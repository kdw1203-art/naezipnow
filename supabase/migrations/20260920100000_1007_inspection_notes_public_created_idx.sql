/* [1007] 공개 임장노트 목록의 부분 인덱스.
   (2026-09-20 MCP 적용 완료 — 인덱스 2건은 execute_sql 로 CONCURRENTLY 생성 뒤 원장에 멱등 기록, MV 는 apply_migration 한 트랜잭션. 원장 version 은 파일명 그대로.)

   ── 왜 ────────────────────────────────────────────────────────────────
   실측(2026-09-20, Vercel 오류 로그): `inspection_notes 조회 실패: TimeoutError` — 공개 노트 24건
   조회(listPublicNotes(24))가 10초 상한을 넘겼다. 표는 34행이라 질의 비용이 아니라 **연결 풀
   대기**다(lib/supabase/read-budget.ts: PostgREST statement_timeout 8초 안에 모든 질의가 끝난다).
   따라서 이 인덱스가 타임아웃을 없애지는 않는다. 그래도 두는 이유:
     · 공개 목록 질의는 전부 같은 모양이다 — `is_public = true` 필터 + `created_at desc` 정렬 +
       limit(24/50/100/200), 커서 페이지는 여기에 `created_at < $1` 한 줄(listPublicNotesPage).
       지금은 seq scan + sort 로도 34행이라 0.x ms 지만, 노트가 수천 건이 되면 정렬이 붙는다.
     · 부분 인덱스라 비공개 노트(대부분)는 인덱스에 안 들어간다 — 크기가 공개 노트 수에만 비례.
     · 코드 쪽 정리(같은 판): ai_analysis(가장 큰 jsonb)를 공개 목록 select 에서 뺐다 —
       lib/inspection/store-db.ts listPublicNotes/listPublicNotesPage 주석.

   ── 대조한 기존 인덱스 ────────────────────────────────────────────────
   저장소 마이그레이션에 inspection_notes 의 (is_public, created_at) 계열 인덱스는 없다
   (wave8 의 trgm 두 개 — title·summary — 뿐). 20260802082133 은 정책 통합·타 표 인덱스 정리.

   ── 적용 절차 ──────────────────────────────────────────────────────────
   CONCURRENTLY 는 트랜잭션 안에서 못 돈다. MCP apply_migration 이 트랜잭션으로 감싸면
   CONCURRENTLY 를 빼고 그냥 CREATE INDEX 로 적용해도 된다(34행 — 잠금이 1ms 도 안 간다).
   적용 뒤 확인:
     select indexname, indexdef from pg_indexes
      where tablename = 'inspection_notes' and indexname = 'inspection_notes_public_created_idx';
     explain (analyze, buffers)
       select id from public.inspection_notes where is_public = true order by created_at desc limit 24;
   되돌림: drop index concurrently if exists public.inspection_notes_public_created_idx;
   권한: 인덱스는 GRANT 대상이 아니다 — 새 권한 없음. */

create index concurrently if not exists inspection_notes_public_created_idx
  on public.inspection_notes (created_at desc)
  where is_public = true;
