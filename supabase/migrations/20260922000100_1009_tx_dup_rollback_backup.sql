-- [1009] 2026-07(202607) 실거래 이중 적재 정리 — 1단계: 되돌리기용 백업
--
-- 무엇: 같은 거래가 두 수집 경로로 두 번 들어간 행 중 **옛 경로(플랫폼 ETL · 40자리 sha1 external_key)** 사본.
--   · 옛 경로가 2026-07-14~17 에 7월분을 넣었고, 2026-08 GitHub ETL 의 "직전월 보강"
--     (/api/cron/molit-transactions-ingest?yyyymm=202607 — 최근 3개월은 기존 적재 여부와 무관하게 다시 받는다)이
--     같은 거래를 `molit-cron:` 키로 다시 넣었다. 키 레시피가 달라 upsert 가 겹침을 못 막았다.
--   · 판정: 같은 거래 유형·계약월·시군구·단지명·계약일·금액(매매가/보증금/월세)·전용면적·층이 **모두 같은**
--     cron 행이 있는 옛 경로 행만. 한쪽에만 있는 행(매매 195·전월세 1,582)과 면적만 미세하게 다른 행(8)은 건드리지 않는다.
--   · 실측(2026-09-22, 읽기 전용): 매매 2,163 · 전월세 6,302 = 8,465행, 34개 시군구.
--     예) 서울 동대문구 래미안위브 2026.07.14 59.99㎡ 7층 16.2억 — 옛 키 c64cd4a7… 와 molit-cron:ac7bf28a… (aptSeq 11230-2587 동일)
-- 왜: 7월 거래 건수·평균이 부풀고(5개 구 표본 7월 그룹의 13.7%), 단지 실거래 목록에 같은 줄이 두 번 보였다.
-- 소유자 승인: 2026-09-22 "백업 후 정리(권장)".
-- 되돌리기: insert into public.market_transactions select * from ops.tx_dup_rollback_20260922;
-- ops 스키마는 PostgREST 에 노출하지 않는다(기존 rollback 표와 같은 방식, GRANT 없음).
set local statement_timeout = '180s';

create table if not exists ops.tx_dup_rollback_20260922 (like public.market_transactions including defaults);

insert into ops.tx_dup_rollback_20260922
select o.*
from public.market_transactions o
where o.contract_ym = '202607'
  and o.transaction_type in ('trade', 'rent')
  and o.external_key not like 'molit-cron:%'
  and exists (
    select 1
    from public.market_transactions c
    where c.transaction_type = o.transaction_type
      and c.contract_ym = o.contract_ym
      and c.region_code = o.region_code
      and c.complex_name = o.complex_name
      and c.contract_day is not distinct from o.contract_day
      and c.deal_amount_krw is not distinct from o.deal_amount_krw
      and c.deposit_krw is not distinct from o.deposit_krw
      and c.monthly_rent_krw is not distinct from o.monthly_rent_krw
      and c.area_m2 = o.area_m2
      and c.floor is not distinct from o.floor
      and c.external_key like 'molit-cron:%'
  )
  and not exists (select 1 from ops.tx_dup_rollback_20260922 b where b.id = o.id);
