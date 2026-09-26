/* [1007] 단지별 매매 실거래 조회를 인덱스 전용 스캔으로 — property_type 을 INCLUDE 에.
   (적용은 통합자가 한다. CONCURRENTLY 는 트랜잭션 밖에서만 돈다 — 아래 절차대로 문장 하나씩.
    적용 뒤 이 머리글의 "DRAFT — 미적용" 을 지우고 원장 version 을 적을 것.)

   ── 실측 ──────────────────────────────────────────────────────────────
   pg_stat_statements(2026-09-20 누적): market_transactions 의 **단지별** 조회가 mean 122ms · max 8s ·
   152k 회. 24h 서버리스 호출 1위가 /complex/[id] 8,907회(+ /embed/complex 1,723 · /api/complex/[id]/detail
   614 · /api/og/complex 1,008)라, 한 단지 렌더가 이 표를 6~8번 읽는다(아래 목록).

   ── 코드가 내는 질의 모양(lib/**) ─────────────────────────────────────
   공통: complex_name = $1 AND region_name = $2 (또는 region_name = ANY($2) — 표기 후보 2개)
         AND transaction_type = 'trade' AND is_cancelled = false
     a. complex-store.ts:416  + ORDER BY build_year DESC NULLS LAST LIMIT 1           (address, build_year)
     b. complex-store.ts:956  + deal_amount_krw > 0 AND area_m2 IS NOT NULL ORDER BY contract_ym DESC LIMIT 60
     c. complex-store.ts:1014 + 위와 같음 LIMIT 400
     d. complex-store.ts:1082/1147 + deal_amount_krw > 0 ORDER BY contract_ym DESC (PostgREST 상한 1000행)
     e. complex-trade-window.ts:46 + **property_type = 'apartment'** AND deal_amount_krw > 0
                                   AND contract_ym >= $3 ORDER BY contract_ym DESC LIMIT n   ← "범위" 질의
     f. complex-price.ts:117  + **property_type = 'apartment'** AND area_m2 IS NOT NULL
                                   ORDER BY contract_ym DESC, contract_day DESC NULLS LAST LIMIT n
     g. complex-transactions.ts:423 + **property_type = 'apartment'** AND deal_amount_krw IS NOT NULL
                                   ORDER BY contract_ym DESC, contract_day DESC NULLS LAST LIMIT n
   (전월세 h. complex-rent.ts:84 는 mt_rent_complex_ym_cov_idx 가 property_type 까지 INCLUDE 해 이미 index-only.)

   ── 기존 인덱스와 대조(20260902130000, 운영 적용됨) ─────────────────────
   mt_trade_complex_cov_idx (region_name, complex_name, contract_ym DESC)
     INCLUDE (contract_day, deal_amount_krw, area_m2, floor, build_year, address, price_per_pyeong_krw)
     WHERE transaction_type = 'trade' AND is_cancelled = false
   → 키·조건은 위 8개 질의와 전부 맞는다. **빠진 것은 property_type 하나**다. e·f·g 는 property_type
     으로 거르는데 그 열이 인덱스에 없어 후보 행마다 힙을 읽는다(Index Scan + heap fetch). 단지 한 곳의
     12개월 매매는 수십~수백 행이고 콜드 크롤(하루 경로 10,925종)에서는 그 힙 페이지가 캐시에 없다 —
     max 8s 는 statement_timeout 근처의 이런 호출로 보인다. property_type 을 INCLUDE 에 넣으면 e·f·g 도
     Index Only Scan 이 된다(a~d 는 이미 index-only). 새 복합 인덱스를 더 만들지 않고 **같은 키의 인덱스를
     한 열 넓혀 교체**한다 — 같은 키 인덱스 둘을 유지하면 쓰기 비용만 두 배다(실거래 적재 크론 매일).

   ── 적용 절차(문장 하나씩, 트랜잭션 밖) ────────────────────────────────
   1) 아래 CREATE INDEX CONCURRENTLY (수 분 — 표가 큰 만큼; 실패하면 INVALID 인덱스가 남으니
      pg_indexes/pg_index.indisvalid 확인 뒤 DROP 하고 재시도).
   2) ANALYZE public.market_transactions;
   3) EXPLAIN (ANALYZE, BUFFERS) 로 e 모양 질의를 확인 — "Index Only Scan using mt_trade_complex_cov2_idx"
      와 "Heap Fetches: 0~소수" 여야 한다. 예:
        explain (analyze, buffers)
        select contract_ym, deal_amount_krw, area_m2 from public.market_transactions
         where complex_name = '헬리오시티' and region_name = '서울 송파구'
           and transaction_type = 'trade' and is_cancelled = false and property_type = 'apartment'
           and deal_amount_krw > 0 and contract_ym >= '202410'
         order by contract_ym desc limit 400;
      (이미 Index Only Scan · Heap Fetches 0 이면 이 인덱스는 필요 없다 — 그때는 1)을 되돌리고 끝.)
   4) 확인이 끝난 뒤에만: DROP INDEX CONCURRENTLY public.mt_trade_complex_cov_idx;  (아래 주석 문장)
   되돌림: DROP INDEX CONCURRENTLY IF EXISTS public.mt_trade_complex_cov2_idx; 그리고 20260902130000 의
           mt_trade_complex_cov_idx 정의로 재생성.
   권한: 인덱스는 GRANT 대상이 아니다 — 새 권한 없음. 크기 추정: 옛 인덱스 + 행당 ~10B(property_type). */

create index concurrently if not exists mt_trade_complex_cov2_idx
  on public.market_transactions (region_name, complex_name, contract_ym desc)
  include (property_type, contract_day, deal_amount_krw, area_m2, floor, build_year, address, price_per_pyeong_krw)
  where transaction_type = 'trade' and is_cancelled = false;

-- 3) 의 EXPLAIN 확인 뒤에만 실행(같은 키의 옛 인덱스 — 새 인덱스가 완전히 대신한다):
-- drop index concurrently if exists public.mt_trade_complex_cov_idx;
