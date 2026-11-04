-- ============================================================================
-- [1103] 운영 DB 제안 — **적용하지 않았다**. 소유자가 검토 후 SQL 편집기/마이그레이션으로 적용한다.
-- 프로젝트: pbhiskvwpwwhtkmnhkbm · 근거는 2026-11-03 읽기 전용 실측(EXPLAIN / EXPLAIN ANALYZE · pg_stat_statements · pg_roles).
--
-- 코드 쪽 고침은 이 파일 없이도 선다:
--   · 신고가 크론 · 주간 시황 → lib/market/price-highs.ts 가 RPC 를 더는 부르지 않는다(아래 1번은 RPC 를 계속 쓸 때만 필요).
--   · 지역 전월세 표본 → lib/market/rent.ts 가 달별 인덱스 읽기로 바뀌었다(DB 변경 없음).
--   · 단지 화면 · 뉴스 주제 허브 · 사이트맵 인덱스 → DB 변경 없음.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) detect_new_price_highs — LATERAL 의 취소 조건을 부분 인덱스와 같은 꼴로 (선택: 이 RPC 를 다시 쓸 때만)
-- ----------------------------------------------------------------------------
-- 증상: /api/cron/price-record-watch(2026-11-03T13:23) · /api/cron/weekly-market-post(2026-11-02T14:22)
--       "57014 canceling statement due to statement timeout".
--
-- 원인 ①: LATERAL 이 `coalesce(t.is_cancelled,false)=false` 라 부분 인덱스
--         mt_trade_complex_cov2_idx (region_name, complex_name, contract_ym DESC) INCLUDE (... deal_amount_krw, area_m2 ...)
--         WHERE transaction_type='trade' AND is_cancelled=false
--         의 술어를 플래너가 증명하지 못한다(is_cancelled 는 NOT NULL 이라 뜻은 같다). 그래서 mt_trade_complex_geo_idx + 힙 읽기.
--   EXPLAIN ANALYZE(헬리오시티 · 84㎡ · 단독 LATERAL):
--     coalesce 판   : Index Scan mt_trade_complex_geo_idx · 490.4 ms · shared read=609 · Rows Removed by Filter 921
--     is_cancelled 판: Index Only Scan mt_trade_complex_cov2_idx · 18.0 ms · shared read=22 · Heap Fetches 1
--   규모(2026-11-03, p_hours=26): 새 매매 7,728행 → 묶음 4,651개 → LATERAL 4,651회 · 훑는 단지 매매 합계 422,424행.
--
-- 원인 ②: 상한은 함수 자체의 `SET statement_timeout TO '25s'` 다 — 운영 요청 id 의 시작 시각 13:22:48.9Z → 오류 로그
--         13:23:14.4Z(≈25.5초). pg_stat_statements(끝난 호출만 남는다): 59회 · 평균 6,822 ms · 최대 22,506 ms — 상한 바로 밑.
--
-- 원인 ③(플랜 모양): 새 매매 창의 행 수 추정이 1행(실제 7,728) — market_transactions 의 created_at 히스토그램이 마지막
--         자동 ANALYZE(2026-11-01 12:26 UTC) 이후 값(최근 26시간)을 모른다. 그래서 중첩 루프가 "바깥 1행"으로 계획된다.
--         (아래 2번)
--
-- 제안: LATERAL(과 fresh)의 취소 조건만 바꾼다. 나머지 본문·EXECUTE ... USING 구조·인자·결과 모양은 그대로.
--       적용 뒤에도 4,651회 LATERAL 은 남는다 — 앱 쪽 판(lib/market/price-highs.ts: 금액 순 상위 300묶음만 · 묶음당 18ms 안팎)이
--       더 가볍다. RPC 를 다시 쓸 생각이 없다면 이 1번은 건너뛰어도 된다(함수는 지금 아무도 부르지 않는다 —
--       grep: lib/market/price-record-watch.ts · lib/market/weekly-highs.ts 둘 다 1103 에서 걷음).
CREATE OR REPLACE FUNCTION public.detect_new_price_highs(p_hours integer DEFAULT 26, p_min_prior integer DEFAULT 10, p_margin numeric DEFAULT 1.03, p_limit integer DEFAULT 5)
 RETURNS TABLE(complex_name text, region_name text, area integer, deal_amount_krw bigint, prior_max bigint, prior_n integer, contract_ym text, contract_day integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
 SET statement_timeout TO '25s'
AS $function$
begin
  return query execute $q$
  with fresh as (
    select distinct on (t.complex_name, t.region_name, round(t.area_m2)::int)
           t.complex_name, t.region_name, round(t.area_m2)::int as area,
           t.deal_amount_krw::bigint as deal_amount_krw, t.contract_ym, t.contract_day
    from public.market_transactions t
    where t.transaction_type='trade' and t.property_type='apartment'
      and t.is_cancelled = false                                   -- [1103] coalesce(...) 대신 (NOT NULL 열)
      and t.created_at > now() - make_interval(hours => $1)
      and t.deal_amount_krw is not null and t.area_m2 is not null
      and t.contract_ym >= to_char(now()-interval '1 month','YYYYMM')
    order by t.complex_name, t.region_name, round(t.area_m2)::int,
             t.deal_amount_krw desc
  )
  select f.complex_name, f.region_name, f.area, f.deal_amount_krw,
         h.prior_max, h.prior_n, f.contract_ym, f.contract_day
  from fresh f
  cross join lateral (
    select max(t.deal_amount_krw)::bigint as prior_max, count(*)::int as prior_n
    from public.market_transactions t
    where t.complex_name=f.complex_name and t.region_name=f.region_name
      and t.area_m2 >= f.area - 2.5 and t.area_m2 < f.area + 2.5  -- [1103] round(area)::int between ±2 와 같은 범위 · 인덱스 INCLUDE 열로 거른다
      and t.transaction_type='trade' and t.is_cancelled = false     -- [1103] 부분 인덱스 술어와 같은 꼴
      and t.contract_ym < f.contract_ym
      and t.contract_ym >= to_char(now()-interval '3 years','YYYYMM')
  ) h
  where h.prior_n >= $2 and h.prior_max is not null
    and f.deal_amount_krw > h.prior_max * $3
  order by f.deal_amount_krw desc
  limit greatest(1, $4)
  $q$ using p_hours, p_min_prior, p_margin, p_limit;
end;
$function$;
-- 확인(적용 뒤 · 읽기 전용): EXPLAIN 에서 LATERAL 이 "Index Only Scan using mt_trade_complex_cov2_idx" 인지 본다.


-- ----------------------------------------------------------------------------
-- 2) market_transactions 통계 갱신 (선택 · 유지보수)
-- ----------------------------------------------------------------------------
-- 근거: pg_stat_user_tables — last_autoanalyze 2026-11-01 12:26 UTC · n_mod_since_analyze 22,243 · n_live_tup 5,230,285.
--       `created_at > now() - interval '26 hours'` 추정 3,116행 / 실제 20,055행(Bitmap Index Scan market_transactions_created_at_idx),
--       위 RPC 의 fresh CTE 는 추정 1행 / 실제 7,728행. 매일 2만 행 남짓이 들어오는데 자동 ANALYZE 문턱(기본 10% = 52만 행)에
--       한참 못 미쳐 최근 값의 분포가 며칠씩 비어 있다.
-- 제안 A(한 번): 아래 한 줄. 5.6GB 표지만 ANALYZE 는 표본(기본 30,000행 × default_statistics_target)만 읽는다.
ANALYZE public.market_transactions (created_at, contract_ym, is_cancelled, transaction_type);
-- 제안 B(지속): 이 표만 자동 ANALYZE 문턱을 낮춘다 — 하루 적재량(≈2만 행) 근처에서 돈다.
-- ALTER TABLE public.market_transactions SET (autovacuum_analyze_scale_factor = 0.0, autovacuum_analyze_threshold = 20000);


-- ----------------------------------------------------------------------------
-- 3) 참고 — 바꾸지 말 것(진단 메모)
-- ----------------------------------------------------------------------------
-- · 단지 대표행(getComplexBaseById) 질의는 느리지 않다: 가장 큰 단지(헬리오시티)도 Index Only Scan mt_trade_complex_cov2_idx
--   1,304행 · 14.4 ms. "단지 정보 조회 시간 초과 (4000ms)" 23건(8/24~10/31)은 질의가 아니라 렌더 폭주 때 PostgREST 연결 대기다.
--   인덱스를 더 만들 일이 아니다(app/complex/[id]/page.tsx [1103] "한 번 더" 주석).
-- · 지역 전월세 표본: (contract_ym, id) 정렬 쪽 나누기가 원인이었다 — 인덱스 mt_rent_region_ym_cov_idx 에 id 가 없어 쪽마다
--   힙 재읽기(송파 3개월 1,981행 · 쪽당 195 ms · read=275). 달 하나 · 정렬 없음은 Index Only Scan 0.66 ms · Heap Fetches 0.
--   id 를 INCLUDE 에 넣는 인덱스(431MB 짜리 재작성)보다 앱 쪽 달별 읽기가 싸서 DB 변경을 제안하지 않는다.
