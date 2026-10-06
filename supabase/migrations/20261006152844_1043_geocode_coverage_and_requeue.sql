-- [1043] 지오코딩 — ① 커버리지 집계 ② 규칙이 바뀐 뒤 다시 물을 줄 ③ 다른 도시에 찍힌 좌표 8건 되돌리기
-- 소유자 지시(2026-10-06): "지오코딩이 잘 되도록 해줘".
-- 실측(같은 날): 아파트 단지 39,354곳 중 좌표 39,042 · 못 찾음 202 · 미시도 110. 못 찾은 단지는 거래가 많은 신축 택지가 많다
-- (지번이 "가-" · "BL-" 같은 블록 자리). 단지명만으로 물은 후보가 250~310km 밖에 찍혀 "성공"으로 굳은 행도 있었다.

-- ① 관리 화면의 진행률 — 분자(좌표 있는 행 전체)와 분모(매매 단지 수)의 모집단이 달라 늘 100% · 남음 0 이었다.
--    같은 모집단(집계 뷰의 단지)에서 센다. 분양·입주 단지처럼 뷰 밖의 행은 따로 센다.
create or replace function public.geocode_coverage()
returns table(complexes bigint, with_coord bigint, notfound bigint, untried bigint, other_with_coord bigint, other_notfound bigint)
language sql
stable security definer
set search_path to 'public'
as $function$
  with s as (
    select region_name, complex_name from public.complex_tx_stats_base
  ), j as (
    select g.status, (g.lat is not null and g.lng is not null) as has_coord, (s.region_name is not null) as in_stats
    from public.complex_geocode g
    left join s on s.region_name = g.region_name and s.complex_name = g.complex_name
  )
  select
    (select count(*) from s),
    (select count(*) from j where in_stats and status = 'ok' and has_coord),
    (select count(*) from j where in_stats and status = 'notfound'),
    (select count(*) from s) - (select count(*) from j where in_stats),
    (select count(*) from j where not in_stats and status = 'ok' and has_coord),
    (select count(*) from j where not in_stats and status = 'notfound');
$function$;

revoke all on function public.geocode_coverage() from public, anon, authenticated;
grant execute on function public.geocode_coverage() to service_role;

-- ② 백필 대상 — 예전 함수(complexes_needing_geocode)와 같은 줄에 "규칙이 바뀌기 전에 못 찾은 행"을 더한다.
--    p_retry_before 보다 먼저 시도한 못 찾음은 7일을 기다리지 않고 다시 묻는다(새 규칙: 거래 원본의 도로명·진짜 지번).
--    예전 함수는 그대로 둔다 — 배포 전 코드가 계속 부른다.
create or replace function public.complexes_needing_geocode_v2(p_limit integer default 200, p_retry_before timestamptz default null)
returns table(region_name text, complex_name text, address text, trade_count bigint)
language sql
stable security definer
set search_path to 'public'
as $function$
  select s.region_name,
         s.complex_name,
         s.address,
         s.trade_count
  from public.complex_tx_stats s
  where not exists (
    select 1 from public.complex_geocode g
    where g.region_name = s.region_name
      and g.complex_name = s.complex_name
      and (g.status <> 'notfound'
           or (g.geocoded_at is not null
               and g.geocoded_at >= now() - interval '7 days'
               and (p_retry_before is null or g.geocoded_at >= p_retry_before)))
  )
  order by s.trade_count desc, s.tx_count desc, s.region_name, s.complex_name
  limit greatest(1, least(1000, p_limit));
$function$;

revoke all on function public.complexes_needing_geocode_v2(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.complexes_needing_geocode_v2(integer, timestamptz) to service_role;

-- ③ 주소가 아닌 질의(단지명 · 동 이름)로 찍힌 좌표 8건 — "동서"·"인왕"·"삼도"·"삼천리"·"마포로5-09-1"·"영흥"은 38~312km 밖,
--    둘은 동 한가운데였다. 좌표를 비우고 못 찾음으로 돌려 다음 백필이 주소로 다시 묻게 한다(8일 전 시각 = 바로 대상).
update public.complex_geocode
set status = 'notfound', lat = null, lng = null, geocoded_at = now() - interval '8 days'
where status = 'ok' and query is not null
  and (query !~ '[0-9]' or query = complex_name or query = region_name || ' ' || complex_name);