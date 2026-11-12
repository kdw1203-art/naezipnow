-- [1165] 운영 실측(2026-11-12 · pg_stat_statements): market_region_names() 평균 4.3초 · 최대 8초(60회) — /complex/[id] "단지 정보 조회 시간 초과(4000ms)" 의 원인.
-- 매매 인덱스가 전부 부분 인덱스(is_cancelled = false)인데 함수에 그 조건이 없어 Seq Scan 을 129번 돌았다. 조건을 맞추면 Index Only Scan 110ms.
-- 결과는 "해제되지 않은 매매가 있는 지역"으로 같다. 여러 번 돌려도 안전.
create or replace function public.market_region_names()
 returns table(region_name text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with recursive t as (
    select ''::text as region_name
    union all
    select (
      select m.region_name
        from public.market_transactions m
       where m.transaction_type = 'trade'
         and m.is_cancelled = false
         and m.complex_name is not null
         and m.region_name is not null
         and m.region_name > t.region_name
       order by m.region_name
       limit 1
    )
    from t
    where t.region_name is not null
  )
  select t.region_name
    from t
   where t.region_name is not null
     and t.region_name <> ''
   order by 1;
$function$;

-- 수집 작업의 "이 지역 · 이 달 건수" 조회(1,593회 · 평균 210ms · Seq Scan)용 인덱스.
create index if not exists mt_region_code_ym_idx on public.market_transactions (region_code, contract_ym);
