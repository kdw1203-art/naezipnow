-- [1030 · 5차] K-apt 원천의 테스트 행 13개(이름 'test'·'테스트'·'한국감정원'·'한국부동산원테스트1' 등) 격리 — 실제 단지가 아니다.
-- 지우지 않고(운영 자료 삭제 금지) metadata 에 표식만 둔다. 적재 코드(lib/national-data/apartment-ingest.ts KAPT_TEST_NAME_RE)는 같은 이름을 더 넣지 않는다.
-- 소유자가 Supabase SQL 편집기에서 실행. 되돌리기: metadata - 'test_row'.
update public.apartment_complexes
   set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('test_row', true, 'test_row_marked_at', now())
 where source_key = 'k-apt-basic'
   and name ~* '^(test\d*|테스트(단지)?\d*|한국감정원\d*|한국부동산원테스트\d*)$'
   and coalesce(metadata->>'test_row', '') <> 'true';
