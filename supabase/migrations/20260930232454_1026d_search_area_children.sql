-- [1026d · 검색 보강] 테스트 뒤 더한 것 — "동네로 좁히기".
-- 지역 이름만 쳤을 때("마포구" · "서울" · "안양") 그 안의 아래 단계 지역(시군구 → 읍면동, 시도·시 → 시군구)을
-- 6개월 거래 많은 순으로 돌려준다. /search 가 "동네로 좁히기: 아현동 16 · 도화동 15 …" 칩으로 그린다.
-- 자료는 20260930225407 의 market_agg.search_area_mv(매일 19:45 UTC 갱신) — 새 표 없음. 읽기 전용 · anon EXECUTE.

create or replace function public.search_area_children(p_regions text[], p_dong text default null, p_limit int default 8)
returns table(
  kind text, area_key text, label text, short_label text, regions text[], dong text,
  complex_count int, recent_trade_count bigint, lat double precision, lng double precision
)
language sql
stable
security definer
set search_path = public, market_agg
as $$
  select a.kind, a.area_key, a.label, a.short_label, a.regions, a.dong,
         a.complex_count, a.recent_trade_count, a.lat, a.lng
    from market_agg.search_area_mv a
   where p_dong is null
     and p_regions is not null
     and (
       (cardinality(p_regions) > 1 and a.kind = 'sigungu' and a.regions[1] = any(p_regions))
       or (cardinality(p_regions) = 1 and a.kind = 'dong' and a.regions[1] = p_regions[1])
     )
   order by a.recent_trade_count desc, a.complex_count desc, a.label
   limit greatest(1, least(coalesce(p_limit, 8), 20));
$$;

revoke all on function public.search_area_children(text[], text, int) from public;
grant execute on function public.search_area_children(text[], text, int) to anon, authenticated, service_role;