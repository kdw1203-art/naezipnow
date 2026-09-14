-- [996] 2026-07-01 행정구역 개편 반영 — 국토교통부 전국 법정동(2026-06-30, 공공데이터포털 15063424) 기준.
-- 인천: 중구(28110)·동구(28140)·서구(28260) 폐지 → 제물포구 28125 · 영종구 28155 · 서해구 28275 · 검단구 28290.
-- 광주광역시(29)+전라남도(46) → 전남광주통합특별시(12): 구는 "광주 X구", 시·군은 "전남 X시" 로 표기(사람이 부르는 이름).
-- 화성시: 만세구 41591 · 효행구 41593 · 병점구 41595 · 동탄구 41597 신설 → 41590 은 상위 코드.
-- 실측: 위 지역 실거래가 7월(화성은 4월)부터 0행 — RTMS 가 새 코드로만 답하는데 legal_regions FK 와 코드 표가 옛 코드였다.
-- 옛 코드 행은 지우지 않는다(과거 적재 행이 FK 로 참조) — enabled=false + metadata.retired/successor 로 표시만.
-- 신설 구의 lat/lng 는 대략적 중심(구청 소재지 미확정) — 지도 마커 초기 위치 용도일 뿐 사실값이 아니다.
insert into public.legal_regions (lawd_cd, sido, sigungu, display_name, scope, lat, lng, enabled, priority, metadata, region_phase)
values
  ('12110','전남','목포시','전남 목포시','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12130','전남','여수시','전남 여수시','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12150','전남','순천시','전남 순천시','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12170','전남','나주시','전남 나주시','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12190','전남','광양시','전남 광양시','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12710','전남','담양군','전남 담양군','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12720','전남','곡성군','전남 곡성군','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12730','전남','구례군','전남 구례군','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12740','전남','고흥군','전남 고흥군','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12750','전남','보성군','전남 보성군','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12760','전남','화순군','전남 화순군','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12770','전남','장흥군','전남 장흥군','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12780','전남','강진군','전남 강진군','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12790','전남','해남군','전남 해남군','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12800','전남','영암군','전남 영암군','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12810','전남','무안군','전남 무안군','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12820','전남','함평군','전남 함평군','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12830','전남','영광군','전남 영광군','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12840','전남','장성군','전남 장성군','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12850','전남','완도군','전남 완도군','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12860','전남','진도군','전남 진도군','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12870','전남','신안군','전남 신안군','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12210','광주','동구','광주 동구','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12240','광주','서구','광주 서구','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12270','광주','남구','광주 남구','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12300','광주','북구','광주 북구','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('12330','광주','광산구','광주 광산구','nationwide',null,null,true,0,'{}'::jsonb,null),
  ('28125','인천','제물포구','인천 제물포구','metro',37.474,126.6432,true,32,'{}'::jsonb,'gyeonggi'),
  ('28155','인천','영종구','인천 영종구','metro',37.4938,126.5364,true,32,'{}'::jsonb,'gyeonggi'),
  ('28275','인천','서해구','인천 서해구','metro',37.5454,126.6768,true,32,'{}'::jsonb,'gyeonggi'),
  ('28290','인천','검단구','인천 검단구','metro',37.596,126.669,true,32,'{}'::jsonb,'gyeonggi'),
  ('41591','경기','화성시 만세구','화성 만세구','metro',37.2,126.83,true,40,'{}'::jsonb,'gyeonggi'),
  ('41593','경기','화성시 효행구','화성 효행구','metro',37.218,126.95,true,40,'{}'::jsonb,'gyeonggi'),
  ('41595','경기','화성시 병점구','화성 병점구','metro',37.205,127.035,true,40,'{}'::jsonb,'gyeonggi'),
  ('41597','경기','화성시 동탄구','화성 동탄구','metro',37.201,127.098,true,40,'{}'::jsonb,'gyeonggi')
on conflict (lawd_cd) do update
  set sido = excluded.sido, sigungu = excluded.sigungu, display_name = excluded.display_name,
      enabled = true, updated_at = now();

update public.legal_regions r
   set enabled = false,
       metadata = coalesce(r.metadata, '{}'::jsonb) || jsonb_build_object('retired', '2026-07-01', 'successor', m.successor),
       updated_at = now()
  from (values
    ('28110','28125'),
    ('28140','28125'),
    ('28260','28275'),
    ('29110','12210'),
    ('29140','12240'),
    ('29155','12270'),
    ('29170','12300'),
    ('29200','12330'),
    ('41590','41597'),
    ('46110','12110'),
    ('46130','12130'),
    ('46150','12150'),
    ('46170','12170'),
    ('46230','12190'),
    ('46710','12710'),
    ('46720','12720'),
    ('46730','12730'),
    ('46770','12740'),
    ('46780','12750'),
    ('46790','12760'),
    ('46800','12770'),
    ('46810','12780'),
    ('46820','12790'),
    ('46830','12800'),
    ('46840','12810'),
    ('46860','12820'),
    ('46870','12830'),
    ('46880','12840'),
    ('46890','12850'),
    ('46900','12860'),
    ('46910','12870')
  ) as m(old_cd, successor)
 where r.lawd_cd = m.old_cd;
