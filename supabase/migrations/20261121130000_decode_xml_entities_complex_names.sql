-- [1206] 실거래 단지명의 XML 글자 참조 풀기.
-- 2026-11-10(새 DB) 이후 MOLIT 수집이 XML 을 정규식으로 읽으며 "&amp;" · "&lt;" 를 그대로 저장했다(1,839행 · 단지 13곳).
-- 수집 코드는 lib/national-data/xml-entities 로 고쳤다. external_key 는 원천 표기로 계산하므로 그대로 둔다(재수집 중복 없음).
-- 순서: &lt; · &gt; 먼저, &amp; 마지막(한 번만 푼다 — "&amp;lt;" 는 "&lt;").

update public.market_transactions
   set complex_name = replace(replace(replace(complex_name, '&lt;', '<'), '&gt;', '>'), '&amp;', '&')
 where complex_name ~ '&(amp|lt|gt);';

-- 좌표 표: 풀린 이름 행이 이미 있으면 그 행을 두고 옛 행을 지운다
delete from public.complex_geocode g
 where g.complex_name ~ '&(amp|lt|gt);'
   and exists (
     select 1 from public.complex_geocode d
      where d.region_name = g.region_name
        and d.complex_name = replace(replace(replace(g.complex_name, '&lt;', '<'), '&gt;', '>'), '&amp;', '&')
   );
update public.complex_geocode
   set complex_name = replace(replace(replace(complex_name, '&lt;', '<'), '&gt;', '>'), '&amp;', '&')
 where complex_name ~ '&(amp|lt|gt);';
