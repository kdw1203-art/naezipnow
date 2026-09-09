-- 982 — 시군구별 단지 대장 신선도 뷰.
--
-- 왜: 대장 수집(app/api/cron/apt-master-ingest)이 어느 시군구를 훑을지 **시계로**
-- 골랐다. `floor(now/12h) % 22` 라 하루 한 번 같은 시각에 돌면 짝수 슬라이스만
-- 방문하고 홀수 11개(≈132개 시군구)는 **영원히 안 돈다**. 실측으로 재현했고,
-- 적재 로그도 그대로다 — 09-06 slice=0, 09-07 slice=2, 09-08 slice=4, 09-09 slice=6.
--
-- 그 결과(2026-09-09 실측, source_key='k-apt-basic'):
--   대전 44일 · 광주 43일 · 세종 43일 · 인천 34일 · 울산 33일 · 경기 20일 경과
--   전남(46)은 대장에 아예 없음 · 광주·대전·제주는 시군구가 1개만 잡혀 있음
--
-- 고치는 방법: 시계 대신 **가장 오래 안 본 시군구부터** 고른다. 그러면 빠진 지역이
-- 자동으로 앞으로 오고, 한 바퀴 돌 때까지 기다릴 필요가 없다(자기 치유).
-- 이 뷰는 그 판단에 필요한 "시군구별 마지막 갱신"만 준다. 전체 시군구 목록은
-- 코드(lib/national-data/region-codes)에 있으므로, 여기 없는 코드 = 한 번도 못 받은
-- 시군구이고 호출부가 그걸 최우선으로 올린다.
--
-- 가산만 · 재실행 안전 · service_role 만 읽는다(운영 크론 전용).

create or replace view public.apt_master_sigungu_freshness as
select
  lawd_cd,
  count(*)::int            as complexes,
  max(updated_at)          as last_update,
  min(updated_at)          as first_update
from public.apartment_complexes
where source_key = 'k-apt-basic'
  and lawd_cd is not null
group by lawd_cd;

comment on view public.apt_master_sigungu_freshness is
  '시군구별 단지 대장 신선도 — apt-master 크론이 "가장 오래 안 본 시군구"를 고르는 근거(982)';

/* 이 뷰는 운영 크론(service_role)만 읽는다. anon·authenticated 에게는 주지 않는다 —
   화면이 쓸 값이 아니고, 시군구별 적재 상태는 운영 정보다. */
revoke all on public.apt_master_sigungu_freshness from anon, authenticated;
grant select on public.apt_master_sigungu_freshness to service_role;
