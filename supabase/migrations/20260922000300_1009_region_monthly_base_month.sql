-- [1009] refresh_market_region_monthly — 창의 **첫 달** 전월비를 매일 null 로 덮어쓰던 것 수정.
--
-- 무엇이 틀렸나(리뷰 RC 실측 2026-09-22): agg 가 v_from..v_to 만 읽어서 첫 달(v_from)은 전월 행이 없어
-- pct 가 null 인데, 그 행도 upsert 했다. 주 1회 전체 재집계가 되살려도 다음 날 다시 지워졌다 —
-- 오늘 첫 달 202605 는 10건 이상 210곳 중 trend_delta_pct 가 있는 곳이 0곳, /reports/202605 는 전 행이
-- "변동 미상"이고 상승·하락 상위가 사라졌다(화면은 "두 달 10건 이상일 때만"이라 표본 탓으로 읽혔다).
-- 어떻게: 집계는 한 달 앞(v_base = v_from − 1개월)부터 읽어 첫 달의 전월을 확보하고, **쓰기는 v_from 부터만**.
-- 시그니처·반환형·SECURITY DEFINER·search_path 는 그대로(create or replace — ACL 유지, 새 GRANT 없음).
create or replace function public.refresh_market_region_monthly(p_months integer default 4, p_min_tx integer default 10)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  t0 timestamptz := clock_timestamp();
  v_from text := to_char((now() at time zone 'Asia/Seoul') - make_interval(months => greatest(p_months, 1)), 'YYYYMM');
  v_base text := to_char((now() at time zone 'Asia/Seoul') - make_interval(months => greatest(p_months, 1) + 1), 'YYYYMM');
  v_to   text := to_char((now() at time zone 'Asia/Seoul'), 'YYYYMM');
  v_rows integer;
begin
  with agg as (
    select
      t.region_code,
      l.display_name                                as region_name,
      t.transaction_type                            as deal_type,
      t.property_type,
      t.contract_ym                                 as month,
      count(*)::integer                             as transaction_count,
      round(avg(t.deal_amount_krw))::bigint         as avg_deal_amount_krw,
      round(avg(t.deposit_krw))::bigint             as avg_deposit_krw,
      round(avg(t.monthly_rent_krw))::bigint        as avg_monthly_rent_krw,
      round(avg(t.price_per_pyeong_krw))::bigint    as avg_price_per_pyeong_krw,
      l.region_phase
    from public.market_transactions t
    join public.legal_regions l on l.lawd_cd = t.region_code
    where t.property_type = 'apartment'
      and t.transaction_type in ('trade', 'rent')
      and coalesce(t.is_cancelled, false) = false
      and t.contract_ym >= v_base
      and t.contract_ym <= v_to
    group by t.region_code, l.display_name, t.transaction_type, t.property_type,
             t.contract_ym, l.region_phase
  ),
  withprev as (
    select
      a.*,
      p.avg_price_per_pyeong_krw as prev_pp,
      p.transaction_count        as prev_tx
    from agg a
    left join agg p
      on  p.region_code    = a.region_code
      and p.deal_type      = a.deal_type
      and p.property_type  = a.property_type
      and p.month = to_char(to_date(a.month, 'YYYYMM') - interval '1 month', 'YYYYMM')
  ),
  calc as (
    select
      w.*,
      case
        when w.prev_pp is null or w.prev_pp = 0 or w.avg_price_per_pyeong_krw is null then null
        -- 표본이 얇으면 변동률을 내지 않는다(구성 잡음이 시장 신호로 둔갑하는 것을 막음).
        when w.transaction_count < p_min_tx or coalesce(w.prev_tx, 0) < p_min_tx then null
        else round(((w.avg_price_per_pyeong_krw - w.prev_pp)::numeric / w.prev_pp) * 100, 2)
      end as pct
    from withprev w
  )
  insert into public.market_region_monthly (
    region_code, region_name, deal_type, property_type, month,
    transaction_count, avg_deal_amount_krw, avg_deposit_krw, avg_monthly_rent_krw,
    avg_price_per_pyeong_krw, trend, trend_delta_pct, source, metadata, region_phase, updated_at
  )
  select
    c.region_code, c.region_name, c.deal_type, c.property_type, c.month,
    c.transaction_count, c.avg_deal_amount_krw, c.avg_deposit_krw, c.avg_monthly_rent_krw,
    c.avg_price_per_pyeong_krw,
    case
      when c.pct is null   then '데이터 부족'
      when c.pct >=  0.5   then '상승'
      when c.pct <= -0.5   then '하락'
      else '보합'
    end,
    c.pct,
    'MOLIT',
    jsonb_build_object(
      'source_table', 'market_transactions',
      'rebuilt_by',   'refresh_market_region_monthly',
      'tx_count',     c.transaction_count,
      'min_tx',       p_min_tx,
      'window_months', p_months
    ),
    c.region_phase,
    now()
  from calc c
  -- [1009] 한 달 앞(v_base)은 전월 비교용으로만 읽고 쓰지 않는다
  where c.month >= v_from
  on conflict (region_code, deal_type, property_type, month) do update set
    region_name              = excluded.region_name,
    transaction_count        = excluded.transaction_count,
    avg_deal_amount_krw      = excluded.avg_deal_amount_krw,
    avg_deposit_krw          = excluded.avg_deposit_krw,
    avg_monthly_rent_krw     = excluded.avg_monthly_rent_krw,
    avg_price_per_pyeong_krw = excluded.avg_price_per_pyeong_krw,
    trend                    = excluded.trend,
    trend_delta_pct          = excluded.trend_delta_pct,
    source                   = excluded.source,
    metadata                 = excluded.metadata,
    region_phase             = excluded.region_phase,
    updated_at               = excluded.updated_at;

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'ok', true,
    'from', v_from, 'base', v_base, 'to', v_to, 'min_tx', p_min_tx, 'window_months', p_months,
    'upserted', v_rows,
    'duration_ms', round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int
  );
end;
$function$;
