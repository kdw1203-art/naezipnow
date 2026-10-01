-- [1026e · 검색 속도] 테스트에서 찾은 것 — 넓은 범위 조건 검색이 느렸다(운영 DB 실측 2026-10-01):
--   search_complexes_filtered(서울 전체 · 30평대) 2,028ms · search_next_words(서울 전체) 692ms · (서울 · 신축) 502ms.
--   단지마다 면적대 거래(tx_band_complex_mv)를 그 자리에서 모으고 주소에서 읍면동을 뽑느라 그랬다.
-- 단지 한 줄에 검색이 쓰는 값(읍면동 · 정규화 이름 · 면적대별 거래 수/합 · 대장과 지번으로 맞은 세대수 · 좌표 · id)을 미리 모아 둔
-- market_agg.search_complex_mv 를 만들고, 두 함수가 그것만 읽게 바꾼다(같은 서명 · 같은 결과 규칙).
--   · 읍면동은 지번 주소의 읍면동(market_agg.addr_dong) — search_area_mv 의 동과 같은 값이라 '주소에 그 낱말이 든다' 보다 정확하다.
--   · 갱신: 매일 19:50 UTC(시장 집계 19:00 · 지역 목록 19:45 뒤). 읽기 전용 · anon EXECUTE 그대로.

create materialized view if not exists market_agg.search_complex_mv as
with bands as (
  select t.region_name, t.complex_name,
         coalesce(sum(t.tx_count) filter (where t.band_key = 'under-60'), 0)::int as u60_tx,
         coalesce(sum(t.avg_krw::numeric * t.tx_count) filter (where t.band_key = 'under-60'), 0) as u60_sum,
         coalesce(sum(t.tx_count) filter (where t.band_key = '60-85'), 0)::int as m85_tx,
         coalesce(sum(t.avg_krw::numeric * t.tx_count) filter (where t.band_key = '60-85'), 0) as m85_sum,
         coalesce(sum(t.tx_count) filter (where t.band_key = '85-102'), 0)::int as b102_tx,
         coalesce(sum(t.avg_krw::numeric * t.tx_count) filter (where t.band_key = '85-102'), 0) as b102_sum,
         coalesce(sum(t.tx_count) filter (where t.band_key = '102-135'), 0)::int as b135_tx,
         coalesce(sum(t.avg_krw::numeric * t.tx_count) filter (where t.band_key = '102-135'), 0) as b135_sum,
         coalesce(sum(t.tx_count) filter (where t.band_key = 'over-135'), 0)::int as o135_tx,
         coalesce(sum(t.avg_krw::numeric * t.tx_count) filter (where t.band_key = 'over-135'), 0) as o135_sum
    from market_agg.tx_band_complex_mv t
   where t.band_kind = 'area'
   group by t.region_name, t.complex_name
)
select public.complex_id(b.region_name, b.complex_name) as complex_id,
       b.region_name,
       b.complex_name,
       b.address,
       s.road_address,
       market_agg.addr_dong(b.address) as dong,
       regexp_replace(lower(b.complex_name), '[^0-9a-z가-힣]', '', 'g') as norm_name,
       b.trade_count,
       b.recent_trade_count,
       b.avg_price_manwon,
       b.avg_area_m2,
       b.build_year,
       s.households,
       case when coalesce(s.households_source, '') <> 'name' then s.households end as households_ok,
       coalesce(t.u60_tx, 0) as u60_tx, coalesce(t.u60_sum, 0) as u60_sum,
       coalesce(t.m85_tx, 0) as m85_tx, coalesce(t.m85_sum, 0) as m85_sum,
       coalesce(t.b102_tx, 0) as b102_tx, coalesce(t.b102_sum, 0) as b102_sum,
       coalesce(t.b135_tx, 0) as b135_tx, coalesce(t.b135_sum, 0) as b135_sum,
       coalesce(t.o135_tx, 0) as o135_tx, coalesce(t.o135_sum, 0) as o135_sum,
       g.lat,
       g.lng
  from public.complex_tx_stats_base b
  left join market_agg.complex_spec_resolved s
    on s.region_name = b.region_name
   and s.complex_name = b.complex_name
  left join bands t
    on t.region_name = b.region_name
   and t.complex_name = b.complex_name
  left join public.complex_geocode g
    on g.region_name = b.region_name
   and g.complex_name = b.complex_name
   and g.status = 'ok';

create unique index if not exists search_complex_mv_key on market_agg.search_complex_mv (region_name, complex_name);
create index if not exists search_complex_mv_dong on market_agg.search_complex_mv (region_name, dong);

create or replace function public.search_complexes_filtered(
  p_regions text[] default null,
  p_dong text default null,
  p_names text[] default null,
  p_min_year int default null,
  p_max_year int default null,
  p_min_households int default null,
  p_area_bands text[] default null,
  p_min_price bigint default null,
  p_max_price bigint default null,
  p_sort text default 'trades',
  p_limit int default 8,
  p_offset int default 0
)
returns table(
  complex_id text, region_name text, complex_name text, address text, road_address text,
  trade_count bigint, recent_trade_count bigint, avg_price_manwon bigint, avg_area_m2 numeric,
  build_year int, households int, lat double precision, lng double precision,
  band_price_manwon bigint, band_trade_count int, total_count bigint
)
language sql
stable
security definer
set search_path = public, market_agg
as $$
  with c as (
    select m.*,
           case when p_area_bands is null then null else
             (case when 'under-60' = any(p_area_bands) then m.u60_tx else 0 end
            + case when '60-85' = any(p_area_bands) then m.m85_tx else 0 end
            + case when '85-102' = any(p_area_bands) then m.b102_tx else 0 end
            + case when '102-135' = any(p_area_bands) then m.b135_tx else 0 end
            + case when 'over-135' = any(p_area_bands) then m.o135_tx else 0 end) end as band_tx,
           case when p_area_bands is null then null else
             (case when 'under-60' = any(p_area_bands) then m.u60_sum else 0 end
            + case when '60-85' = any(p_area_bands) then m.m85_sum else 0 end
            + case when '85-102' = any(p_area_bands) then m.b102_sum else 0 end
            + case when '102-135' = any(p_area_bands) then m.b135_sum else 0 end
            + case when 'over-135' = any(p_area_bands) then m.o135_sum else 0 end) end as band_sum
      from market_agg.search_complex_mv m
     where (p_regions is null or m.region_name = any(p_regions))
       and (p_dong is null or m.dong = p_dong)
       and (p_names is null or not exists (select 1 from unnest(p_names) n where m.norm_name not like '%' || n || '%'))
       and (p_min_year is null or m.build_year >= p_min_year)
       and (p_max_year is null or m.build_year <= p_max_year)
       and (p_min_households is null or m.households_ok >= p_min_households)
  ), priced as (
    select c.*,
           case when c.band_tx > 0 then (round(c.band_sum / c.band_tx / 10000))::bigint end as band_avg,
           coalesce(case when c.band_tx > 0 then (round(c.band_sum / c.band_tx / 10000))::bigint end, c.avg_price_manwon) as eff_price
      from c
     where p_area_bands is null or c.band_tx > 0
  ), kept as (
    select * from priced
     where (p_min_price is null or priced.eff_price >= p_min_price)
       and (p_max_price is null or priced.eff_price <= p_max_price)
  ), ranked as (
    select kept.*,
           row_number() over (
             order by
               case when p_sort = 'new' then kept.build_year end desc nulls last,
               case when p_sort = 'price_asc' then kept.eff_price end asc nulls last,
               case when p_sort = 'price_desc' then kept.eff_price end desc nulls last,
               case when p_sort = 'households' then kept.households end desc nulls last,
               kept.recent_trade_count desc nulls last,
               kept.trade_count desc nulls last,
               kept.complex_name
           ) as rn,
           count(*) over () as total
      from kept
  )
  select r.complex_id, r.region_name, r.complex_name, r.address, r.road_address,
         r.trade_count, r.recent_trade_count, r.avg_price_manwon, r.avg_area_m2, r.build_year, r.households,
         r.lat, r.lng, r.band_avg, r.band_tx, r.total
    from ranked r
   where r.rn > greatest(0, least(coalesce(p_offset, 0), 300))
     and r.rn <= greatest(0, least(coalesce(p_offset, 0), 300)) + greatest(1, least(coalesce(p_limit, 8), 30))
   order by r.rn;
$$;

create or replace function public.search_next_words(
  p_regions text[] default null,
  p_dong text default null,
  p_names text[] default null,
  p_min_year int default null,
  p_max_year int default null,
  p_min_households int default null,
  p_area_bands text[] default null,
  p_min_price bigint default null,
  p_max_price bigint default null,
  p_year int default null
)
returns table(kind text, word text, cnt int)
language sql
stable
security definer
set search_path = public, market_agg
as $$
  with y as (
    select coalesce(p_year, extract(year from (now() at time zone 'Asia/Seoul'))::int) as yr
  ), c as (
    select m.region_name, m.dong, m.norm_name, m.build_year, m.households_ok, m.avg_price_manwon,
           m.u60_tx, m.m85_tx, m.b102_tx, m.b135_tx,
           case when p_area_bands is null then null else
             (case when 'under-60' = any(p_area_bands) then m.u60_tx else 0 end
            + case when '60-85' = any(p_area_bands) then m.m85_tx else 0 end
            + case when '85-102' = any(p_area_bands) then m.b102_tx else 0 end
            + case when '102-135' = any(p_area_bands) then m.b135_tx else 0 end
            + case when 'over-135' = any(p_area_bands) then m.o135_tx else 0 end) end as band_tx,
           case when p_area_bands is null then null else
             (case when 'under-60' = any(p_area_bands) then m.u60_sum else 0 end
            + case when '60-85' = any(p_area_bands) then m.m85_sum else 0 end
            + case when '85-102' = any(p_area_bands) then m.b102_sum else 0 end
            + case when '102-135' = any(p_area_bands) then m.b135_sum else 0 end
            + case when 'over-135' = any(p_area_bands) then m.o135_sum else 0 end) end as band_sum
      from market_agg.search_complex_mv m
     where (p_regions is not null or p_dong is not null or p_names is not null
            or p_min_year is not null or p_max_year is not null or p_min_households is not null
            or p_area_bands is not null or p_min_price is not null or p_max_price is not null)
       and (p_regions is null or m.region_name = any(p_regions))
       and (p_dong is null or m.dong = p_dong)
       and (p_names is null or not exists (select 1 from unnest(p_names) n where m.norm_name not like '%' || n || '%'))
       and (p_min_year is null or m.build_year >= p_min_year)
       and (p_max_year is null or m.build_year <= p_max_year)
       and (p_min_households is null or m.households_ok >= p_min_households)
  ), f as (
    select c.*,
           coalesce(case when c.band_tx > 0 then (round(c.band_sum / c.band_tx / 10000))::bigint end, c.avg_price_manwon) as eff_price
      from c
     where (p_area_bands is null or c.band_tx > 0)
       and (p_min_price is null
            or coalesce(case when c.band_tx > 0 then (round(c.band_sum / c.band_tx / 10000))::bigint end, c.avg_price_manwon) >= p_min_price)
       and (p_max_price is null
            or coalesce(case when c.band_tx > 0 then (round(c.band_sum / c.band_tx / 10000))::bigint end, c.avg_price_manwon) <= p_max_price)
  ), agg as (
    select count(*)::int as total,
           count(*) filter (where f.build_year >= y.yr - 5)::int as new5,
           count(*) filter (where f.build_year between y.yr - 10 and y.yr - 6)::int as semi10,
           count(*) filter (where f.build_year <= y.yr - 30)::int as old30,
           count(*) filter (where f.households_ok >= 1000)::int as big1000,
           count(*) filter (where f.u60_tx > 0)::int as u60,
           count(*) filter (where f.m85_tx > 0)::int as m85,
           count(*) filter (where f.b102_tx > 0 or f.b135_tx > 0)::int as l135,
           count(*) filter (where f.eff_price <= 50000)::int as p_u5,
           count(*) filter (where f.eff_price <= 100000)::int as p_u10,
           count(*) filter (where f.eff_price >= 150000)::int as p_o15
      from f
     cross join y
  ), brands(word, key) as (
    values ('래미안', '래미안'), ('자이', '자이'), ('푸르지오', '푸르지오'), ('힐스테이트', '힐스테이트'),
           ('e편한세상', '편한세상'), ('아이파크', '아이파크'), ('롯데캐슬', '롯데캐슬'), ('더샵', '더샵'),
           ('SK뷰', 'sk뷰'), ('꿈에그린', '꿈에그린'), ('데시앙', '데시앙'), ('센트레빌', '센트레빌'),
           ('위브', '위브'), ('호반', '호반'), ('어울림', '어울림'), ('스타힐스', '스타힐스'),
           ('우미린', '우미린'), ('수자인', '수자인'), ('한신', '한신'), ('현대', '현대'),
           ('삼성', '삼성'), ('우성', '우성'), ('주공', '주공')
  )
  select 'total'::text, ''::text, agg.total from agg
  union all
  select 'cond', v.k, v.n
    from agg
   cross join lateral (values
     ('new5', agg.new5), ('semi10', agg.semi10), ('old30', agg.old30), ('big1000', agg.big1000),
     ('u60', agg.u60), ('m85', agg.m85), ('l135', agg.l135),
     ('p_u5', agg.p_u5), ('p_u10', agg.p_u10), ('p_o15', agg.p_o15)
   ) as v(k, n)
   where agg.total > 0
  union all
  (select 'sgg', f.region_name, count(*)::int
     from f
    where p_dong is null
      and (p_regions is null or cardinality(p_regions) > 1)
    group by f.region_name
    order by count(*) desc, f.region_name
    limit 12)
  union all
  (select 'dong', f.dong, count(*)::int
     from f
    where p_dong is null
      and cardinality(p_regions) = 1
      and f.dong is not null
    group by f.dong
    order by count(*) desc, f.dong
    limit 16)
  union all
  (select 'brand', b.word, count(*)::int
     from brands b
     join f on f.norm_name like '%' || b.key || '%'
    where p_names is null
    group by b.word
    order by count(*) desc, b.word
    limit 8);
$$;

revoke all on function public.search_complexes_filtered(text[], text, text[], int, int, int, text[], bigint, bigint, text, int, int) from public;
revoke all on function public.search_next_words(text[], text, text[], int, int, int, text[], bigint, bigint, int) from public;
grant execute on function public.search_complexes_filtered(text[], text, text[], int, int, int, text[], bigint, bigint, text, int, int) to anon, authenticated, service_role;
grant execute on function public.search_next_words(text[], text, text[], int, int, int, text[], bigint, bigint, int) to anon, authenticated, service_role;

select cron.schedule(
  'search-complex-refresh-daily',
  '50 19 * * *',
  $cron$refresh materialized view concurrently market_agg.search_complex_mv$cron$
);