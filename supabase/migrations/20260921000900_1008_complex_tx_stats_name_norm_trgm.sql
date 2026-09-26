/* [1008 · S] 단지 이름 "정규화 키" 트라이그램 인덱스 — search_complexes_preview v2(20260921001000)의
   "정규화 이름 포함" 갈래용. 적용됨 2026-09-21 — execute_sql 로 CREATE INDEX CONCURRENTLY(valid, 4,640 kB) → ANALYZE →
   EXPLAIN: Bitmap Index Scan on complex_tx_stats_name_norm_trgm, 0.29ms('%한가람삼성%'). 원장 기록은
   apply_migration '1008_complex_tx_stats_name_norm_trgm'(IF NOT EXISTS, no-op).

   ── 왜 ────────────────────────────────────────────────────────────────
   "한가람삼성"(질의) ↔ "한가람(삼성)"(DB), "힐스테이트 광교" ↔ "힐스테이트광교" 처럼 괄호·띄어쓰기만 다른
   이름을 잡으려면 regexp_replace(lower(complex_name), '[^0-9a-z가-힣]', '', 'g') 에 LIKE '%키%' 를 걸어야
   한다. 이 표현식에 인덱스가 없으면 행마다 regexp_replace 를 돈다(36,724행).

   ── 실측(2026-09-21 운영, 읽기 전용 EXPLAIN ANALYZE) ─────────────────────
   · 인덱스 없이 그 조건 하나:  Index Only Scan(pk) + Filter, Rows Removed 36,723 → 62~230ms (부하에 따라 흔들림)
   · v2 함수 생성 SQL 전체(계획+실행, p_limit 8):
       질의              지금(인덱스 없음)   원문 트라이그램 인덱스로 같은 모양을 잰 대리값
       E편한세상 사천          262.3ms            24.9ms
       사천 스카이             140.5ms            19.3ms
       한가람삼성              192.8ms             4.8ms
       그린타운우성            306.2ms             6.9ms
       벽절골롯데              179.1ms             3.9ms
       공작아파트               89.6ms            18.2ms
       힐스테이트 광교         144.0ms            24.7ms
       동탄 롯데캐슬           140.2ms            17.3ms
       목동 7단지              129.1ms            12.5ms
       래미안 퍼스티지         183.1ms            10.9ms
     (대리값 = 생성 SQL 의 "정규화 키 LIKE" 를 "complex_name ILIKE" 로 바꿔 기존
      complex_tx_stats_name_trgm(GIN, 6MB)을 타게 한 값 — 같은 모양의 GIN 트라이그램 스캔이라 이 인덱스를
      만든 뒤의 값에 가깝다. 적용 뒤 아래 3) 으로 실제 값을 확인할 것.)
   · 목표 < 50ms/질의. 인덱스 크기는 원문 트라이그램 인덱스(6,096kB)와 비슷할 것 — 괄호·공백만 빠진 같은 글자들이다.

   ── IMMUTABLE 확인 ────────────────────────────────────────────────────
   lower(text) · regexp_replace(text,text,text,text) 모두 IMMUTABLE(pg_proc.provolatile='i').
   함수 본문의 식과 **글자 그대로 같아야** 플래너가 인덱스를 쓴다(20260921001000 의 nexpr 상수).

   ── 적용 절차(문장 하나씩, 트랜잭션 밖 — CREATE INDEX CONCURRENTLY 는 트랜잭션 블록 안에서 못 돈다) ──
   1) 아래 CREATE INDEX CONCURRENTLY (36,724행 — 수 초). 실패하면 INVALID 인덱스가 남으니
      pg_index.indisvalid 확인 뒤 DROP INDEX CONCURRENTLY 하고 다시.
   2) ANALYZE public.complex_tx_stats_base;
   3) EXPLAIN (ANALYZE, BUFFERS) SELECT 1 FROM public.complex_tx_stats_base b
        WHERE regexp_replace(lower(b.complex_name), '[^0-9a-z가-힣]', '', 'g') LIKE '%한가람삼성%';
      → "Bitmap Index Scan on complex_tx_stats_name_norm_trgm" 확인.
   4) 그다음 20260921001000_1008_search_complexes_preview_v2.sql 적용.

   매트뷰 갱신(REFRESH … CONCURRENTLY)은 이 인덱스도 함께 고친다 — 쓰기 비용은 원문 트라이그램 인덱스 하나만큼.
   되돌리기: DROP INDEX CONCURRENTLY IF EXISTS public.complex_tx_stats_name_norm_trgm;
*/

create index concurrently if not exists complex_tx_stats_name_norm_trgm
  on public.complex_tx_stats_base
  using gin ((regexp_replace(lower(complex_name), '[^0-9a-z가-힣]', '', 'g')) extensions.gin_trgm_ops);
