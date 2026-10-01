-- [1026e · 연관 검색어] 소유자(2026-10-01): "띄어쓰기를 할 때 연관검색엔진도 도입해서 검색 기능을 향상시켜줘".
-- 지금까지 친 말(지역·이름·조건)로 고른 단지 묶음 안에서, 다음에 붙일 만한 낱말과 그 단지 수를 돌려준다.
--   cond  — 신축·준신축·재건축·대단지·20/30/40평대·5억 이하·10억 이하·15억 이상(준공·세대·실거래 면적·평균 매매가)
--   dong  — 시군구 하나 안이면 읍면동(지번 주소의 읍면동 · market_agg.addr_dong)
--   sgg   — 범위가 없거나 여러 시군구면 시군구(region_name)
--   brand — 이름에 든 주요 브랜드(이름을 아직 안 쳤을 때만)
--   total — 지금 묶음의 단지 수(낱말이 묶음을 줄이지 않으면 화면이 뺀다)
-- 조건 규칙은 public.search_complexes_filtered(20260930225407)와 같다 — 칩을 눌러 얻는 결과 수가 여기 적힌 수와 같다.
-- 아무 조건도 없으면(전국 전체) 아무것도 돌려주지 않는다. 읽기 전용 · anon EXECUTE.

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
    select b.region_name, b.complex_name, b.address, b.build_year, b.avg_price_manwon,
           s.households, s.households_source,
           regexp_replace(lower(b.complex_name), '[^0-9a-z가-힣]', '', 'g') as norm_name
      from public.complex_tx_stats_base b
      left join market_agg.complex_spec_resolved s
        on s.region_name = b.region_name
       and s.complex_name = b.complex_name
     where (p_regions is not null or p_dong is not null or p_names is not null
            or p_min_year is not null or p_max_year is not null or p_min_households is not null
            or p_area_bands is not null or p_min_price is not null or p_max_price is not null)
       and (p_regions is null or b.region_name = any(p_regions))
       and (p_dong is null or (' ' || coalesce(b.address, '') || ' ') like ('% ' || p_dong || ' %'))
       and (p_names is null or not exists (
             select 1
               from unnest(p_names) n
              where regexp_replace(lower(b.complex_name), '[^0-9a-z가-힣]', '', 'g') not like '%' || n || '%'
           ))
       and (p_min_year is null or b.build_year >= p_min_year)
       and (p_max_year is null or b.build_year <= p_max_year)
       and (p_min_households is null
            or (s.households >= p_min_households and coalesce(s.households_source, '') <> 'name'))
  ), f as (
    select c.region_name, c.complex_name, c.address, c.build_year, c.households, c.households_source, c.norm_name,
           coalesce(bd.band_avg, c.avg_price_manwon) as eff_price,
           coalesce(fl.u60, false) as u60,
           coalesce(fl.m85, false) as m85,
           coalesce(fl.l135, false) as l135
      from c
      left join lateral (
        select (round(sum(t.avg_krw::numeric * t.tx_count) / nullif(sum(t.tx_count), 0) / 10000))::bigint as band_avg,
               sum(t.tx_count)::int as band_tx
          from market_agg.tx_band_complex_mv t
         where t.region_name = c.region_name
           and t.band_kind = 'area'
           and t.band_key = any(p_area_bands)
           and t.complex_name = c.complex_name
      ) bd on p_area_bands is not null
      left join lateral (
        select bool_or(t.band_key = 'under-60') as u60,
               bool_or(t.band_key = '60-85') as m85,
               bool_or(t.band_key in ('85-102', '102-135')) as l135
          from market_agg.tx_band_complex_mv t
         where t.region_name = c.region_name
           and t.band_kind = 'area'
           and t.complex_name = c.complex_name
      ) fl on true
     where (p_area_bands is null or coalesce(bd.band_tx, 0) > 0)
       and (p_min_price is null or coalesce(bd.band_avg, c.avg_price_manwon) >= p_min_price)
       and (p_max_price is null or coalesce(bd.band_avg, c.avg_price_manwon) <= p_max_price)
  ), agg as (
    select count(*)::int as total,
           count(*) filter (where f.build_year >= y.yr - 5)::int as new5,
           count(*) filter (where f.build_year between y.yr - 10 and y.yr - 6)::int as semi10,
           count(*) filter (where f.build_year <= y.yr - 30)::int as old30,
           count(*) filter (where f.households >= 1000 and coalesce(f.households_source, '') <> 'name')::int as big1000,
           count(*) filter (where f.u60)::int as u60,
           count(*) filter (where f.m85)::int as m85,
           count(*) filter (where f.l135)::int as l135,
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
  (select 'dong', x.d, count(*)::int
     from (select market_agg.addr_dong(f.address) as d from f
            where p_dong is null and cardinality(p_regions) = 1) x
    where x.d is not null
    group by x.d
    order by count(*) desc, x.d
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

revoke all on function public.search_next_words(text[], text, text[], int, int, int, text[], bigint, bigint, int) from public;
grant execute on function public.search_next_words(text[], text, text[], int, int, int, text[], bigint, bigint, int) to anon, authenticated, service_role;