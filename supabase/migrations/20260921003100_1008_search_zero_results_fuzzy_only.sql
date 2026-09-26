/* [1008 · S · 리뷰 B] 검색 무결과 로그에 "비슷한 이름만 나왔다"를 따로 적는 열. 적용됨 2026-09-21
   (apply_migration '1008_search_zero_results_fuzzy_only').

   ── 왜 ────────────────────────────────────────────────────────────────
   1008 에서 단지 검색이 오타 추정("벽절골롯데" → 벽적골롯데)을 '비슷한 이름' 으로 보여 주기 시작했다.
   /api/search/unified 는 그 응답을 "결과 있음" 으로 세어 search_zero_results 에 적지 않았다 — 리뷰 B 지적:
   "결과 없음 82%" 의 개선 수치가 부풀 수 있다. 이제 앱은 '비슷한 이름만(다른 그룹도 0건)' 인 검색을
   fuzzy_only=true 로 적는다(app/api/search/unified/route.ts). 이 열이 없으면 그 insert 만 조용히 실패한다
   (PostgREST PGRST204 — 앱이 경고를 남기지 않는다). 진짜 무결과는 예전처럼 fuzzy_only=false(기본값).

   ── 안전 ───────────────────────────────────────────────────────────────
   · 기본값 있는 열 추가 — PG 11+ 는 표를 다시 쓰지 않는다(메타데이터만). 기존 행은 false.
   · 새 GRANT·RLS 변경 없음. 쓰는 쪽은 서비스 롤(unified 라우트) 하나다.
   · 되돌리기: alter table public.search_zero_results drop column if exists fuzzy_only;
     (앱은 열이 없으면 fuzzy_only 행만 못 적는다 — 검색 응답에는 영향 없음)
*/

alter table public.search_zero_results
  add column if not exists fuzzy_only boolean not null default false;

comment on column public.search_zero_results.fuzzy_only is
  '[1008] 단지가 비슷한 이름(오타 추정)뿐이고 다른 그룹도 0건인 검색 — false 는 진짜 무결과';
