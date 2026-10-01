-- [1026d · 검색] 소유자(2026-09-30): "단지·아파트·지역명을 칠 때 연관 검색의 범위와 상세주소·위치를 음영으로 보여 주고,
-- 낱말만 쳐도 키워드·조건으로 원하는 아파트나 지역을 찾게".
-- 배포 전 운영(2026-09-30) 실측: "마포 신축" · "대치동 대단지" · "잠실 30평대" 모두 "일치하는 단지가 없어요",
-- "마포구" 는 노트 3건뿐(지역·단지 없음). 검색이 단지 이름 글자만 봤다 — 지역·조건을 알아듣는 자리가 없었다.
--   1) market_agg.addr_dong          — 지번 주소의 읍면동(lib/complex/dong.ts parseDong 과 같은 규칙)
--   2) market_agg.search_area_mv     — 검색용 지역 목록(시도·시·시군구·읍면동·통칭) + 단지 수·6개월 거래·중심 좌표.
--                                      매일 19:45 UTC(04:45 KST · 시장 집계 19:00 뒤) 갱신
--   3) public.search_areas           — 낱말마다 정확히 맞는 지역 + 앞글자 일치 지역
--   4) public.search_complexes_filtered — 지역·읍면동·이름·준공연도·세대수·면적대·가격 조건으로 단지 목록 + 총 개수
--   5) public.search_complex_facets  — 같은 범위의 조건별 단지 수("마포구 신축 12곳" 연관 검색)
--   6) public.search_complexes_preview_addr — 기존 search_complexes_preview 순서 그대로 + 도로명 주소
-- 전부 읽기 전용 · 공개 실거래 집계 — anon EXECUTE(search_complexes_preview 와 같은 정책).
-- 세대수 조건은 대장과 지번으로 맞춘 값만 쓴다(households_source='name' — 이름만 같은 다른 지역 단지 — 제외).

create or replace function market_agg.addr_dong(p_address text)
returns text
language plpgsql
immutable
parallel safe
as $$
declare
  tok text;
  t text;
  found text := null;
begin
  if p_address is null then
    return null;
  end if;
  foreach tok in array regexp_split_to_array(btrim(p_address), '\s+') loop
    t := regexp_replace(tok, '[^가-힣0-9]', '', 'g');
    continue when t = '';
    exit when t ~ '^[0-9]';
    if t ~ '^[가-힣][가-힣0-9]*[동읍면가리]$' then
      found := t;
    end if;
  end loop;
  return found;
end;
$$;

create materialized view if not exists market_agg.search_area_mv as
with base as (
  select b.region_name,
         coalesce(b.recent_trade_count, 0)::bigint as rtc,
         market_agg.addr_dong(b.address) as dong,
         g.lat,
         g.lng
    from public.complex_tx_stats_base b
    left join public.complex_geocode g
      on g.region_name = b.region_name
     and g.complex_name = b.complex_name
     and g.status = 'ok'
     and g.lat is not null
     and g.lng is not null
), rn as (
  select region_name,
         case when strpos(region_name, ' ') > 0 then split_part(region_name, ' ', 1) end as city,
         case when strpos(region_name, ' ') > 0 then split_part(region_name, ' ', 2) else region_name end as sgg,
         count(*)::int as cnt,
         sum(rtc)::bigint as rtc,
         avg(lat) as lat,
         avg(lng) as lng
    from base
   group by region_name
), metro(city, full_name) as (
  values ('서울', '서울특별시'), ('부산', '부산광역시'), ('대구', '대구광역시'), ('인천', '인천광역시'),
         ('광주', '광주광역시'), ('대전', '대전광역시'), ('울산', '울산광역시')
), alias(alias_key, label, regions) as (
  values ('일산', '고양 일산(동구·서구)', array['고양 일산동구', '고양 일산서구'])
), areas as (
  select 'sido'::text as kind,
         m.city as area_key,
         m.full_name as label,
         m.city as short_label,
         array_agg(rn.region_name order by rn.region_name) as regions,
         null::text as dong,
         array[m.city, m.city || '시', m.full_name] as full_keys,
         array[]::text[] as stem_keys,
         sum(rn.cnt)::int as complex_count,
         sum(rn.rtc)::bigint as recent_trade_count,
         avg(rn.lat) as lat,
         avg(rn.lng) as lng
    from rn
    join metro m on m.city = rn.city
   group by m.city, m.full_name
  union all
  select 'city', rn.city, rn.city || '시', rn.city || '시',
         array_agg(rn.region_name order by rn.region_name), null,
         array[rn.city, rn.city || '시'], array[]::text[],
         sum(rn.cnt)::int, sum(rn.rtc)::bigint, avg(rn.lat), avg(rn.lng)
    from rn
   where rn.city is not null
     and rn.city not in (select city from metro)
   group by rn.city
  union all
  select 'sigungu', rn.region_name, rn.region_name, rn.sgg,
         array[rn.region_name], null,
         array(select k from unnest(array[
                 rn.sgg,
                 coalesce(rn.city, '') || rn.sgg,
                 case when rn.sgg = '세종시' then '세종특별자치시' end
               ]) k where k is not null and char_length(k) >= 2),
         array(select k from unnest(array[regexp_replace(rn.sgg, '(시|군|구)$', '')]) k
                where char_length(k) >= 2 and k <> rn.sgg),
         rn.cnt, rn.rtc, rn.lat, rn.lng
    from rn
  union all
  select 'dong', d.region_name || ' ' || d.dong, d.region_name || ' ' || d.dong, d.dong,
         array[d.region_name], d.dong,
         array[d.dong],
         case when d.dong ~ '[동읍면]$' and char_length(d.dong) >= 3
              then array[left(d.dong, -1)] else array[]::text[] end,
         d.cnt, d.rtc, d.lat, d.lng
    from (
      select region_name, dong, count(*)::int as cnt, sum(rtc)::bigint as rtc, avg(lat) as lat, avg(lng) as lng
        from base
       where dong is not null
       group by region_name, dong
    ) d
  union all
  select 'alias', a.alias_key, a.label, a.alias_key, a.regions, null,
         array[a.alias_key], array[]::text[],
         sum(rn.cnt)::int, sum(rn.rtc)::bigint, avg(rn.lat), avg(rn.lng)
    from alias a
    join rn on rn.region_name = any(a.regions)
   group by a.alias_key, a.label, a.regions
)
select areas.*, regexp_replace(areas.label, '\s', '', 'g') as label_norm
  from areas;

create unique index if not exists search_area_mv_key on market_agg.search_area_mv (kind, area_key);

create or replace function public.search_areas(p_q text, p_limit int default 6)
returns table(
  kind text, area_key text, label text, short_label text, regions text[], dong text,
  complex_count int, recent_trade_count bigint, lat double precision, lng double precision,
  match_token text, match_rank int
)
language sql
stable
security definer
set search_path = public, market_agg
as $$
  with q as (
    select coalesce(array(
             select s.t
               from (
                 select regexp_replace(lower(x), '[^0-9a-z가-힣]', '', 'g') as t, i
                   from unnest(regexp_split_to_array(btrim(coalesce(p_q, '')), '\s+')) with ordinality as u(x, i)
               ) s
              where s.t <> ''
              order by s.i
              limit 6
           ), array[]::text[]) as toks,
           left(regexp_replace(lower(coalesce(p_q, '')), '[^0-9a-z가-힣]', '', 'g'), 40) as whole
  ), exact as (
    select a.kind, a.area_key, a.label, a.short_label, a.regions, a.dong,
           a.complex_count, a.recent_trade_count, a.lat, a.lng,
           t.tok as match_token,
           case when t.tok = any(a.full_keys) then 3 else 2 end as match_rank
      from market_agg.search_area_mv a
     cross join q
     cross join unnest(q.toks) as t(tok)
     where t.tok = any(a.full_keys) or t.tok = any(a.stem_keys)
     order by 12 desc, a.recent_trade_count desc
     limit 24
  ), pre as (
    select a.kind, a.area_key, a.label, a.short_label, a.regions, a.dong,
           a.complex_count, a.recent_trade_count, a.lat, a.lng,
           null::text as match_token, 1 as match_rank
      from market_agg.search_area_mv a
     cross join q
     where q.whole ~ '[가-힣]'
       and (
         a.label_norm like q.whole || '%'
         or exists (select 1 from unnest(a.full_keys) k where k like q.whole || '%')
         or (cardinality(q.toks) > 1
             and exists (select 1 from unnest(a.full_keys) k where k like q.toks[cardinality(q.toks)] || '%'))
       )
       and not exists (select 1 from exact e where e.kind = a.kind and e.area_key = a.area_key)
     order by
       case when exists (select 1 from exact e where e.kind <> 'dong' and e.regions && a.regions) then 0 else 1 end,
       case a.kind when 'sido' then 0 when 'city' then 1 when 'alias' then 1 when 'sigungu' then 2 else 3 end,
       a.recent_trade_count desc
     limit greatest(1, least(coalesce(p_limit, 6), 12))
  )
  select * from exact
  union all
  select * from pre;
$$;

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
    select b.region_name, b.complex_name, b.address, s.road_address,
           b.trade_count, b.recent_trade_count, b.avg_price_manwon, b.avg_area_m2, b.build_year,
           s.households
      from public.complex_tx_stats_base b
      left join market_agg.complex_spec_resolved s
        on s.region_name = b.region_name
       and s.complex_name = b.complex_name
     where (p_regions is null or b.region_name = any(p_regions))
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
  ), banded as (
    select c.*, bd.band_avg, bd.band_tx
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
     where p_area_bands is null or coalesce(bd.band_tx, 0) > 0
  ), priced as (
    select banded.*, coalesce(banded.band_avg, banded.avg_price_manwon) as eff_price
      from banded
     where (p_min_price is null or coalesce(banded.band_avg, banded.avg_price_manwon) >= p_min_price)
       and (p_max_price is null or coalesce(banded.band_avg, banded.avg_price_manwon) <= p_max_price)
  ), ranked as (
    select priced.*,
           row_number() over (
             order by
               case when p_sort = 'new' then priced.build_year end desc nulls last,
               case when p_sort = 'price_asc' then priced.eff_price end asc nulls last,
               case when p_sort = 'price_desc' then priced.eff_price end desc nulls last,
               case when p_sort = 'households' then priced.households end desc nulls last,
               priced.recent_trade_count desc nulls last,
               priced.trade_count desc nulls last,
               priced.complex_name
           ) as rn,
           count(*) over () as total
      from priced
  )
  select public.complex_id(r.region_name, r.complex_name), r.region_name, r.complex_name, r.address, r.road_address,
         r.trade_count, r.recent_trade_count, r.avg_price_manwon, r.avg_area_m2, r.build_year, r.households,
         g.lat, g.lng, r.band_avg, r.band_tx, r.total
    from ranked r
    left join public.complex_geocode g
      on g.region_name = r.region_name
     and g.complex_name = r.complex_name
     and g.status = 'ok'
   where r.rn > greatest(0, least(coalesce(p_offset, 0), 300))
     and r.rn <= greatest(0, least(coalesce(p_offset, 0), 300)) + greatest(1, least(coalesce(p_limit, 8), 30))
   order by r.rn;
$$;

create or replace function public.search_complex_facets(
  p_regions text[] default null,
  p_dong text default null,
  p_names text[] default null,
  p_year int default null
)
returns table(
  total int, new5 int, semi10 int, old30 int, big1000 int,
  band_u60 int, band_60_85 int, band_85_135 int, band_o135 int,
  price_u5 int, price_u10 int, price_o15 int
)
language sql
stable
security definer
set search_path = public, market_agg
as $$
  with y as (
    select coalesce(p_year, extract(year from (now() at time zone 'Asia/Seoul'))::int) as yr
  ), c as (
    select b.region_name, b.complex_name, b.build_year, b.avg_price_manwon, s.households, s.households_source
      from public.complex_tx_stats_base b
      left join market_agg.complex_spec_resolved s
        on s.region_name = b.region_name
       and s.complex_name = b.complex_name
     where (p_regions is not null or p_dong is not null or p_names is not null)
       and (p_regions is null or b.region_name = any(p_regions))
       and (p_dong is null or (' ' || coalesce(b.address, '') || ' ') like ('% ' || p_dong || ' %'))
       and (p_names is null or not exists (
             select 1
               from unnest(p_names) n
              where regexp_replace(lower(b.complex_name), '[^0-9a-z가-힣]', '', 'g') not like '%' || n || '%'
           ))
  ), f as (
    select c.*,
           bool_or(t.band_key = 'under-60') as u60,
           bool_or(t.band_key = '60-85') as m85,
           bool_or(t.band_key in ('85-102', '102-135')) as l135,
           bool_or(t.band_key = 'over-135') as xl
      from c
      left join market_agg.tx_band_complex_mv t
        on t.region_name = c.region_name
       and t.band_kind = 'area'
       and t.complex_name = c.complex_name
     group by c.region_name, c.complex_name, c.build_year, c.avg_price_manwon, c.households, c.households_source
  )
  select count(*)::int,
         count(*) filter (where f.build_year >= y.yr - 5)::int,
         count(*) filter (where f.build_year between y.yr - 10 and y.yr - 6)::int,
         count(*) filter (where f.build_year <= y.yr - 30)::int,
         count(*) filter (where f.households >= 1000 and coalesce(f.households_source, '') <> 'name')::int,
         count(*) filter (where f.u60)::int,
         count(*) filter (where f.m85)::int,
         count(*) filter (where f.l135)::int,
         count(*) filter (where f.xl)::int,
         count(*) filter (where f.avg_price_manwon <= 50000)::int,
         count(*) filter (where f.avg_price_manwon <= 100000)::int,
         count(*) filter (where f.avg_price_manwon >= 150000)::int
    from f
   cross join y
   group by y.yr;
$$;

create or replace function public.search_complexes_preview_addr(p_q text, p_limit int default 8)
returns table(
  complex_id text, region_name text, complex_name text, address text, trade_count bigint,
  recent_trade_count bigint, avg_price_manwon bigint, avg_area_m2 numeric, build_year integer,
  households integer, lat double precision, lng double precision, sim real, exact boolean,
  road_address text
)
language sql
stable
security definer
set search_path = public, market_agg
as $$
  select p.complex_id, p.region_name, p.complex_name, p.address, p.trade_count,
         p.recent_trade_count, p.avg_price_manwon, p.avg_area_m2, p.build_year,
         p.households, p.lat, p.lng, p.sim, p.exact, s.road_address
    from public.search_complexes_preview(p_q, p_limit)
         with ordinality as p(complex_id, region_name, complex_name, address, trade_count,
                              recent_trade_count, avg_price_manwon, avg_area_m2, build_year,
                              households, lat, lng, sim, exact, ord)
    left join market_agg.complex_spec_resolved s
      on s.region_name = p.region_name
     and s.complex_name = p.complex_name
   order by p.ord;
$$;

revoke all on function public.search_areas(text, int) from public;
revoke all on function public.search_complexes_filtered(text[], text, text[], int, int, int, text[], bigint, bigint, text, int, int) from public;
revoke all on function public.search_complex_facets(text[], text, text[], int) from public;
revoke all on function public.search_complexes_preview_addr(text, int) from public;
grant execute on function public.search_areas(text, int) to anon, authenticated, service_role;
grant execute on function public.search_complexes_filtered(text[], text, text[], int, int, int, text[], bigint, bigint, text, int, int) to anon, authenticated, service_role;
grant execute on function public.search_complex_facets(text[], text, text[], int) to anon, authenticated, service_role;
grant execute on function public.search_complexes_preview_addr(text, int) to anon, authenticated, service_role;

select cron.schedule(
  'search-area-refresh-daily',
  '45 19 * * *',
  $cron$refresh materialized view concurrently market_agg.search_area_mv$cron$
);